import { checkNotificationScenarios } from './check-notification-scenarios.mjs';
import { checkBoardScenarios } from './check-board-scenarios.mjs';
import { checkTaskScenarios } from './check-task-scenarios.mjs';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { checkRedis } from './check-redis.mjs';

export async function checkHttpScenarios({
  runtimeUrl,
  migrator,
  redisPort,
  redisPassword,
}) {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    NOTIFICATION_WORKER_ENABLED: 'false',
    DATABASE_URL: runtimeUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: String(redisPort),
    REDIS_PASSWORD: redisPassword,
    REDIS_TLS: 'false',
    TRUSTED_ORIGINS: 'http://localhost:3000',
    PUBLIC_API_URL: 'http://localhost:3001',
    TRUSTED_PROXY_CIDRS: '',
  });
  const { AppModule } = await import('../dist/app.module.js');
  const { configureHttp } =
    await import('../dist/common/http/configure-http.js');
  const { PrismaService } =
    await import('../dist/common/database/prisma.service.js');
  const { RedisService } =
    await import('../dist/common/redis/redis.service.js');
  const { TokenService } =
    await import('../dist/common/redis/token.service.js');
  const { UserService } = await import('../dist/modules/user/user.service.js');
  const { OrganizationService } =
    await import('../dist/modules/organization/organization.service.js');
  const { ProjectService } =
    await import('../dist/modules/project/project.service.js');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureHttp(app);
  await app.init();
  const server = app.getHttpServer();
  const prisma = app.get(PrismaService);
  const tokens = app.get(TokenService);
  const redis = app.get(RedisService);
  const password = 'fixture-long-password';
  const cookies = (response) =>
    response.headers['set-cookie'].map((value) => value.split(';')[0]);
  const send = (actor, method, path) =>
    request(server)
      [method](path)
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', actor.cookie);
  const register = async (name) => {
    const response = await request(server)
      .post('/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({ email: name + '@example.test', name, password })
      .expect(201);
    assert.equal(response.body.authenticated, true);
    assert.equal(response.body.accessToken, undefined);
    assert.ok(
      response.headers['set-cookie'].every(
        (value) => value.includes('HttpOnly') && value.includes('Secure'),
      ),
    );
    return { ...response.body.user, cookie: cookies(response) };
  };
  try {
    console.log('Checking: Redis sessions and shared limits');
    await checkRedis(redis);
    const owner = await register('owner');
    const member = await register('member');
    const outsider = await register('outsider');
    const invited = await register('invited');
    await checkTaskScenarios({
      send,
      prisma,
      migrator,
      owner,
      member,
      outsider,
      invited,
    });
    await checkBoardScenarios({
      app,
      send,
      prisma,
      migrator,
      owner,
      member,
      outsider,
      invited,
    });
    await checkNotificationScenarios({
      app,
      send,
      prisma,
      migrator,
      owner,
      member,
      outsider,
    });
    await request(server).get('/users/profile').expect(401);
    await request(server)
      .patch('/users/profile')
      .set('Cookie', owner.cookie)
      .send({ name: 'bad-origin' })
      .expect(403);
    await send(owner, 'patch', '/users/profile')
      .send({ role: 'ADMIN' })
      .expect(400);
    await send(owner, 'patch', '/users/profile')
      .send({
        bio: 'Profile',
        socialLinks: [{ url: 'https://example.com' }],
        timeZone: 'Europe/Moscow',
        workIntervals: [{ weekday: 1, startMinute: 540, endMinute: 1080 }],
      })
      .expect(200);
    console.log(
      'Checking: organization/project isolation and live visual roles',
    );
    const org = (
      await send(owner, 'post', '/organizations')
        .send({ name: 'Team', slug: 'team' })
        .expect(201)
    ).body;
    const base = '/organizations/' + org.id;
    const role = (
      await send(owner, 'post', base + '/roles')
        .send({ name: 'Fullstack' })
        .expect(201)
    ).body;
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: member.id, roleId: role.id },
    });
    await send(outsider, 'get', base).expect(404);
    await send(member, 'post', base + '/transfer-ownership')
      .send({ userId: outsider.id })
      .expect(403);
    await send(owner, 'delete', base + '/members/' + owner.id).expect(400);
    const project = (
      await send(member, 'post', base + '/projects')
        .send({ name: 'Web', slug: 'web', taskPrefix: 'WEB' })
        .expect(201)
    ).body;
    const path = base + '/projects/' + project.id;
    const second = (
      await send(owner, 'post', base + '/projects')
        .send({ name: 'API', slug: 'api', taskPrefix: 'API' })
        .expect(201)
    ).body;
    await send(member, 'get', base + '/projects/' + second.id).expect(404);
    await send(outsider, 'get', path).expect(404);
    await send(owner, 'get', path).expect(200);
    const statuses = (await send(member, 'get', path + '/statuses').expect(200))
      .body;
    assert.equal(statuses.length, 5);
    await send(owner, 'patch', base + '/roles/' + role.id)
      .send({ name: 'Frontend' })
      .expect(200);
    const list = (await send(member, 'get', path + '/members').expect(200)).body
      .items;
    assert.equal(list[0].role.name, 'Frontend');
    assert.equal(list[0].projectRoleId, null);
    await send(member, 'post', path + '/members')
      .send({ userId: outsider.id })
      .expect(404);
    const tag = (
      await send(member, 'post', path + '/tags')
        .send({ name: 'Feature', branchPrefix: 'feat' })
        .expect(201)
    ).body;
    const tasks = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        prisma.task.create({
          data: {
            projectId: project.id,
            title: 'Task ' + i,
            statusId: statuses[0].id,
            tagId: tag.id,
          },
        }),
      ),
    );
    assert.equal(new Set(tasks.map((task) => task.number)).size, 8);
    assert.equal(Math.max(...tasks.map((task) => task.number)), 8);
    const foreignStatus = await prisma.taskStatus.findFirstOrThrow({
      where: { projectId: second.id },
    });
    await assert.rejects(
      prisma.task.update({
        where: { id: tasks[0].id },
        data: { statusId: foreignStatus.id },
      }),
    );
    await assert.rejects(
      prisma.task.update({ where: { id: tasks[0].id }, data: { number: 100 } }),
    );
    await send(member, 'patch', path).send({ taskPrefix: 'NEW' }).expect(409);
    await send(member, 'delete', path + '/tags/' + tag.id).expect(409);
    await send(member, 'delete', path + '/statuses/' + statuses[0].id).expect(
      409,
    );
    await send(member, 'delete', path + '/statuses/' + statuses[0].id)
      .send({ replacementStatusId: statuses[1].id })
      .expect(204);
    assert.equal(
      await prisma.task.count({
        where: { projectId: project.id, statusId: statuses[1].id },
      }),
      8,
    );
    await send(member, 'post', path + '/archive').expect(200);
    await send(member, 'patch', path).send({ name: 'blocked' }).expect(409);
    await send(member, 'post', path + '/restore').expect(200);
    const profile = (
      await send(owner, 'get', '/users/' + member.id).expect(200)
    ).body;
    assert.equal(profile.email, member.email);
    assert.deepEqual(
      profile.sharedProjects.map((p) => p.id),
      [project.id],
    );
    await send(outsider, 'get', '/users/' + member.id).expect(404);
    await assert.rejects(
      app.get(UserService).updateProfile(member.id, {
        name: 'must-rollback',
        workIntervals: [{ weekday: 8, startMinute: 1, endMinute: 2 }],
      }),
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).name,
      'member',
    );
    await prisma.taskAssignment.create({
      data: {
        projectId: project.id,
        taskId: tasks[0].id,
        userId: member.id,
        kind: 'ASSIGNEE',
      },
    });
    await assert.rejects(
      prisma.taskAssignment.create({
        data: {
          projectId: project.id,
          taskId: tasks[0].id,
          userId: outsider.id,
          kind: 'REVIEWER',
        },
      }),
    );
    const repository = await prisma.projectRepository.create({
      data: { projectId: project.id, url: 'https://github.com/example/web' },
    });
    const foreignRepo = await prisma.projectRepository.create({
      data: { projectId: second.id, url: 'https://github.com/example/api' },
    });
    await prisma.taskBranch.create({
      data: {
        projectId: project.id,
        taskId: tasks[0].id,
        repositoryId: repository.id,
        name: 'feat/WEB-1',
      },
    });
    await assert.rejects(
      prisma.taskBranch.create({
        data: {
          projectId: project.id,
          taskId: tasks[0].id,
          repositoryId: foreignRepo.id,
          name: 'feat/WEB-1',
        },
      }),
    );
    const notification = await prisma.notification.create({
      data: {
        recipientId: member.id,
        actorId: owner.id,
        taskId: tasks[0].id,
        kind: 'TASK_ASSIGNED',
        title: 'Assignment snapshot',
        body: 'Historical display data',
      },
    });
    assert.equal(notification.emailStatus, 'DISABLED');
    await prisma.taskAttachment.create({
      data: {
        taskId: tasks[0].id,
        storageKey: 'fixture/' + randomUUID(),
        fileName: 'fixture.png',
        mimeType: 'image/png',
        sizeBytes: 10n,
      },
    });
    const firstPage = (
      await send(owner, 'get', base + '/projects?limit=1').expect(200)
    ).body;
    const lastPage = (
      await send(
        owner,
        'get',
        base + '/projects?limit=1&after=' + firstPage.nextCursor,
      ).expect(200)
    ).body;
    assert.equal(lastPage.nextCursor, null);
    assert.notEqual(firstPage.items[0].id, lastPage.items[0].id);
    await prisma.task.delete({ where: { id: tasks[7].id } });
    const nextTask = await prisma.task.create({
      data: {
        projectId: project.id,
        title: 'No reuse',
        statusId: statuses[1].id,
      },
    });
    assert.equal(nextTask.number, 9);
    console.log('Checking: invitation role history and owner-only deletion');
    for (const state of ['revoked', 'expired', 'accepted']) {
      const disposable = (
        await send(owner, 'post', base + '/roles')
          .send({ name: state })
          .expect(201)
      ).body;
      const email =
        state === 'accepted' ? invited.email : state + '@example.test';
      const invitation = (
        await send(owner, 'post', base + '/invitations')
          .send({ email, roleId: disposable.id })
          .expect(201)
      ).body;
      await send(owner, 'delete', base + '/roles/' + disposable.id).expect(409);
      if (state === 'revoked')
        await send(
          owner,
          'delete',
          base + '/invitations/' + invitation.id,
        ).expect(204);
      if (state === 'expired')
        await prisma.organizationInvitation.update({
          where: { id: invitation.id },
          data: {
            createdAt: new Date(Date.now() - 86400000),
            expiresAt: new Date(Date.now() - 1000),
          },
        });
      if (state === 'accepted') {
        const token = new URLSearchParams(
          new URL(invitation.invitationUrl).hash.slice(1),
        ).get('token');
        await send(outsider, 'post', '/organization-invitations/accept')
          .send({ token })
          .expect(403);
        const results = await Promise.all([
          send(invited, 'post', '/organization-invitations/accept').send({
            token,
          }),
          send(invited, 'post', '/organization-invitations/accept').send({
            token,
          }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
        await send(owner, 'patch', base + '/members/' + invited.id + '/role')
          .send({ roleId: role.id })
          .expect(200);
      }
      await send(owner, 'delete', base + '/roles/' + disposable.id).expect(204);
      const history = await prisma.organizationInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      assert.equal(history.roleId, null);
      assert.equal(history.roleName, state);
    }
    await send(member, 'delete', path).send({ password }).expect(403);
    await send(owner, 'delete', path).send({ password: 'wrong' }).expect(400);
    console.log(
      'Checking: concurrent member removal, status deletion and ownership transfer',
    );
    const secondPath = base + '/projects/' + second.id;
    const secondStatuses = await prisma.taskStatus.findMany({
      where: { projectId: second.id },
    });
    for (const status of secondStatuses.slice(2))
      await send(owner, 'delete', secondPath + '/statuses/' + status.id).expect(
        204,
      );
    const deletes = await Promise.all(
      secondStatuses
        .slice(0, 2)
        .map((status) =>
          send(owner, 'delete', secondPath + '/statuses/' + status.id),
        ),
    );
    assert.deepEqual(deletes.map((r) => r.status).sort(), [204, 409]);
    // Hold the organization lock, queue a writer, then remove its membership.
    let release;
    let acquired;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const locked = new Promise((resolve) => {
      acquired = resolve;
    });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app."Organization" WHERE id=${org.id} FOR UPDATE`;
      acquired();
      await gate;
      await tx.projectMember.delete({
        where: {
          projectId_userId: { projectId: project.id, userId: member.id },
        },
      });
    });
    await locked;
    const pending = app
      .get(ProjectService)
      .update(org.id, project.id, member.id, { name: 'must-not-save' });
    const rejected = assert.rejects(
      pending,
      (error) => error.getStatus?.() === 404,
    );
    release();
    await blocker;
    await rejected;
    await send(owner, 'post', path + '/members')
      .send({ userId: member.id })
      .expect(201);
    await send(owner, 'post', base + '/transfer-ownership')
      .send({ userId: member.id })
      .expect(200);
    await send(owner, 'get', path).expect(404);
    await send(member, 'post', base + '/transfer-ownership')
      .send({ userId: owner.id })
      .expect(200);
    await send(owner, 'delete', path).send({ password }).expect(204);
    assert.equal(
      await prisma.task.count({ where: { projectId: project.id } }),
      0,
    );
    assert.ok(await prisma.project.findUnique({ where: { id: second.id } }));
    const retained = await prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    assert.equal(retained.taskId, null);
    assert.equal(retained.title, 'Assignment snapshot');
    assert.equal(
      await prisma.taskAttachment.count({ where: { taskId: tasks[0].id } }),
      0,
    );
    assert.equal(
      await prisma.taskBranch.count({ where: { projectId: project.id } }),
      0,
    );

    console.log('Checking: committed registration during session failure');
    const save = tokens.saveTokens.bind(tokens);
    tokens.saveTokens = async () => {
      throw new Error('simulated unavailable session store');
    };
    let partial;
    try {
      partial = await request(server)
        .post('/auth/register')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'partial@example.test', name: 'Partial', password })
        .expect(201);
    } finally {
      tokens.saveTokens = save;
    }
    assert.equal(partial.body.authenticated, false);
    assert.equal(partial.body.code, 'SESSION_UNAVAILABLE');
    assert.ok(
      await prisma.user.findUnique({
        where: { email: 'partial@example.test' },
      }),
    );
    await request(server)
      .post('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'partial@example.test', password })
      .expect(201);
    console.log(
      'Checking: password/login cleanup race on real PostgreSQL and Redis',
    );
    let releaseCleanup;
    let enteredCleanup;
    const cleanupGate = new Promise((resolve) => {
      releaseCleanup = resolve;
    });
    const cleanupStarted = new Promise((resolve) => {
      enteredCleanup = resolve;
    });
    const remove = tokens.removeTokenVersion.bind(tokens);
    tokens.removeTokenVersion = async (...args) => {
      enteredCleanup();
      await cleanupGate;
      return remove(...args);
    };
    const nextPassword = 'fixture-new-password';
    const changing = app
      .get(UserService)
      .updatePassword(outsider.id, { password, newPassword: nextPassword });
    try {
      await cleanupStarted;
      const fresh = await request(server)
        .post('/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: outsider.email, password: nextPassword })
        .expect(201);
      releaseCleanup();
      await changing;
      await request(server)
        .get('/users/profile')
        .set('Cookie', cookies(fresh))
        .expect(200);
      await send(outsider, 'get', '/users/profile').expect(401);
    } finally {
      releaseCleanup();
      tokens.removeTokenVersion = remove;
    }
    console.log('Checking: password attempt limits and error contract');
    for (let i = 0; i < 5; i++)
      await send(member, 'put', '/users/password')
        .send({ password: 'wrong', newPassword: nextPassword })
        .expect(400);
    const limited = await send(member, 'put', '/users/password')
      .send({ password: 'wrong', newPassword: nextPassword })
      .expect(429);
    assert.equal(limited.body.code, 'RATE_LIMITED');
    assert.ok(limited.body.requestId);
    await send(owner, 'put', '/users/password')
      .send({ password: 'wrong', newPassword: nextPassword })
      .expect(400);
    const spec = (await request(server).get('/docs-json').expect(200)).body;
    assert.ok(spec.components.schemas.SessionDto.properties.authenticated);
    assert.ok(
      spec.paths[
        '/organizations/{organizationId}/projects/{projectId}/tasks/{taskId}'
      ].patch,
    );
    assert.ok(
      spec.paths[
        '/organizations/{organizationId}/projects/{projectId}/tasks/{taskId}/history'
      ].get,
    );
    assert.ok(
      spec.components.schemas.UpdateTaskDto.required.includes(
        'expectedRevision',
      ),
    );
    assert.ok(spec.components.schemas.TaskDto.properties.description);
    assert.ok(
      spec.paths[
        '/organizations/{organizationId}/projects/{projectId}/statuses'
      ],
    );
    await app.get(OrganizationService).delete(org.id, owner.id, { password });
    assert.equal(
      await prisma.project.count({ where: { organizationId: org.id } }),
      0,
    );
    console.log(
      'PASS: real HTTP auth/user/organization/project, role history, access isolation, numbering, cascades, concurrency and foundation regressions',
    );
  } finally {
    await app.close();
  }
}
