import assert from 'node:assert/strict';
import { NotificationWorker } from '../dist/modules/notification/notification.worker.js';

export async function checkNotificationScenarios({
  app,
  send,
  prisma,
  migrator,
  owner,
  member,
  outsider,
}) {
  console.log(
    'Checking: durable notification delivery, retries, privacy and inbox isolation',
  );
  const worker = app.get(NotificationWorker);
  const org = (
    await send(owner, 'post', '/organizations')
      .send({ name: 'Notifications', slug: 'notification-tests' })
      .expect(201)
  ).body;
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: member.id },
  });
  const base = `/organizations/${org.id}`;
  const project = (
    await send(owner, 'post', base + '/projects')
      .send({ name: 'Inbox', slug: 'inbox', taskPrefix: 'IN' })
      .expect(201)
  ).body;
  const path = base + '/projects/' + project.id;
  await send(owner, 'post', path + '/members')
    .send({ userId: member.id })
    .expect(201);
  const task = (
    await send(owner, 'post', path + '/tasks')
      .send({
        title: 'Private title',
        description: 'NEVER_INCLUDE_MARKDOWN',
        assignments: [
          { userId: owner.id, kind: 'ASSIGNEE' },
          { userId: member.id, kind: 'ASSIGNEE' },
          { userId: member.id, kind: 'RESPONSIBLE' },
          { userId: member.id, kind: 'REVIEWER' },
        ],
      })
      .expect(201)
  ).body;
  const jobs = await prisma.notificationJob.findMany({
    where: { taskId: task.id },
  });
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.recipientId === member.id));
  assert.equal(
    await prisma.notification.count({ where: { taskId: task.id } }),
    0,
  );
  await Promise.all([worker.tick(), worker.tick()]);
  assert.equal(
    await prisma.notification.count({ where: { taskId: task.id } }),
    2,
  );
  // Replay after an apparent lost acknowledgement must not duplicate delivery.
  await prisma.notificationJob.updateMany({
    where: { taskId: task.id },
    data: { processedAt: null },
  });
  await worker.tick();
  assert.equal(
    await prisma.notification.count({ where: { taskId: task.id } }),
    2,
  );
  const list = async (actor = member, query = '') =>
    (await send(actor, 'get', '/notifications' + query).expect(200)).body;
  let page = await list(member, '?limit=1');
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  assert.ok(page.items[0].available);
  assert.equal(page.items[0].target.taskId, task.id);
  assert.ok(!JSON.stringify(page).includes('NEVER_INCLUDE_MARKDOWN'));
  const second = await list(member, '?limit=1&after=' + page.nextCursor);
  assert.notEqual(second.items[0].id, page.items[0].id);
  assert.equal(second.nextCursor, null);
  assert.equal((await list(outsider)).items.length, 0);
  await send(
    outsider,
    'patch',
    '/notifications/' + page.items[0].id + '/read',
  ).expect(404);
  await send(outsider, 'get', '/notifications?after=' + page.nextCursor).expect(
    400,
  );
  assert.equal(
    (await send(member, 'get', '/notifications/unread-count').expect(200)).body
      .count,
    2,
  );
  const read = (
    await send(
      member,
      'patch',
      '/notifications/' + page.items[0].id + '/read',
    ).expect(200)
  ).body;
  assert.deepEqual(
    (
      await send(
        member,
        'patch',
        '/notifications/' + page.items[0].id + '/read',
      ).expect(200)
    ).body,
    read,
  );
  assert.equal((await list(member, '?state=unread')).items.length, 1);
  assert.equal(
    (await send(member, 'patch', '/notifications/read-all').expect(200)).body
      .count,
    1,
  );
  assert.equal(
    (await send(member, 'patch', '/notifications/read-all').expect(200)).body
      .count,
    0,
  );
  // No-op assignment update creates neither event nor job.
  await send(owner, 'put', path + '/tasks/' + task.id + '/assignments')
    .send({ expectedRevision: task.revision, assignments: task.assignments })
    .expect(200);
  assert.equal(
    await prisma.notificationJob.count({ where: { taskId: task.id } }),
    2,
  );
  await send(owner, 'delete', path + '/members/' + member.id).expect(204);
  page = await list();
  assert.ok(
    page.items.every(
      (n) =>
        !n.available &&
        n.target === null &&
        n.actorId === null &&
        n.body === '' &&
        n.title === 'Задача недоступна',
    ),
  );
  assert.ok(!JSON.stringify(page).includes('Private title'));
  await send(owner, 'post', path + '/members')
    .send({ userId: member.id })
    .expect(201);
  // Failure persists a bounded retry, then a fresh worker instance resumes it.
  const retry = (
    await send(owner, 'post', path + '/tasks')
      .send({
        title: 'Retry task',
        assignments: [{ userId: member.id, kind: 'ASSIGNEE' }],
      })
      .expect(201)
  ).body;
  await migrator.query(
    `CREATE FUNCTION app.fail_notification_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private provider detail'; END; $$; CREATE TRIGGER fail_notification_test BEFORE INSERT ON app."Notification" FOR EACH ROW EXECUTE FUNCTION app.fail_notification_test();`,
  );
  try {
    await worker.tick();
  } finally {
    await migrator.query(
      'DROP TRIGGER fail_notification_test ON app."Notification"; DROP FUNCTION app.fail_notification_test();',
    );
  }
  const failed = await prisma.notificationJob.findFirstOrThrow({
    where: { taskId: retry.id },
  });
  assert.equal(failed.attempts, 1);
  assert.equal(failed.processedAt, null);
  assert.equal(failed.lastError, 'DELIVERY_FAILED');
  assert.ok(failed.availableAt > failed.createdAt);
  await prisma.notificationJob.update({
    where: { id: failed.id },
    data: { availableAt: new Date(0) },
  });
  const resumed = new NotificationWorker(
    prisma,
    app.get((await import('@nestjs/config')).ConfigService),
  );
  await resumed.tick();
  assert.equal(
    await prisma.notification.count({ where: { taskId: retry.id } }),
    1,
  );
  // Exercise the production timer and graceful shutdown, without relying on a manual tick.
  const automaticTask = (
    await send(owner, 'post', path + '/tasks')
      .send({
        title: 'Automatic delivery',
        assignments: [{ userId: member.id, kind: 'ASSIGNEE' }],
      })
      .expect(201)
  ).body;
  const { ConfigService } = await import('@nestjs/config');
  const automatic = new NotificationWorker(
    prisma,
    new ConfigService({
      NODE_ENV: 'production',
      NOTIFICATION_WORKER_ENABLED: true,
    }),
  );
  automatic.onApplicationBootstrap();
  try {
    const deadline = Date.now() + 10000;
    while (
      (await prisma.notification.count({
        where: { taskId: automaticTask.id },
      })) === 0 &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      await prisma.notification.count({ where: { taskId: automaticTask.id } }),
      1,
    );
  } finally {
    await automatic.beforeApplicationShutdown();
  }
  // Outbox insertion failure rolls back the task, event, assignment and number.
  const before = (
    await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
  ).lastTaskNumber;
  await migrator.query(
    `CREATE FUNCTION app.fail_job_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'job failure'; END; $$; CREATE TRIGGER fail_job_test BEFORE INSERT ON app."NotificationJob" FOR EACH ROW EXECUTE FUNCTION app.fail_job_test();`,
  );
  try {
    await send(owner, 'post', path + '/tasks')
      .send({
        title: 'Must rollback',
        assignments: [{ userId: member.id, kind: 'ASSIGNEE' }],
      })
      .expect(500);
  } finally {
    await migrator.query(
      'DROP TRIGGER fail_job_test ON app."NotificationJob"; DROP FUNCTION app.fail_job_test();',
    );
  }
  assert.equal(
    (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
      .lastTaskNumber,
    before,
  );
  const discarded = (
    await send(owner, 'post', path + '/tasks')
      .send({
        title: 'No access at delivery',
        assignments: [{ userId: member.id, kind: 'ASSIGNEE' }],
      })
      .expect(201)
  ).body;
  await send(owner, 'delete', path + '/members/' + member.id).expect(204);
  await worker.tick();
  assert.equal(
    await prisma.notification.count({ where: { taskId: discarded.id } }),
    0,
  );
  assert.ok(
    (
      await prisma.notificationJob.findFirstOrThrow({
        where: { taskId: discarded.id },
      })
    ).processedAt,
  );
  await prisma.organization.delete({ where: { id: org.id } });
  assert.ok((await list()).items.every((n) => n.target === null));
  assert.ok(
    (
      await prisma.notification.findMany({ where: { recipientId: member.id } })
    ).every((n) => n.emailStatus === 'DISABLED'),
  );
  // Expiration applies immediately to reads, then bounded worker cleanup removes rows.
  await prisma.notification.updateMany({
    where: { recipientId: member.id },
    data: { createdAt: new Date(Date.now() - 91 * 86400000) },
  });
  assert.equal((await list()).items.length, 0);
  await worker.tick();
  assert.equal(
    await prisma.notification.count({ where: { recipientId: member.id } }),
    0,
  );
  console.log(
    'PASS: outbox atomicity/restart/replay, retries, inbox pagination/read, redaction, retention and disabled email',
  );
}
