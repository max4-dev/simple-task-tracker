import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// All requests use real JWT cookies, Redis, Prisma transactions and PostgreSQL.
export async function checkTaskScenarios({
  send,
  prisma,
  migrator,
  owner,
  member,
  outsider,
  invited,
}) {
  console.log(
    'Checking: task API, validation, isolation, versions, history and membership cascades',
  );
  const org = (
    await send(owner, 'post', '/organizations')
      .send({ name: 'Tasks', slug: 'task-tests' })
      .expect(201)
  ).body;
  const base = `/organizations/${org.id}`;
  await prisma.organizationMember.createMany({
    data: [member, invited].map((u) => ({
      organizationId: org.id,
      userId: u.id,
    })),
  });
  const project = (
    await send(member, 'post', base + '/projects')
      .send({ name: 'Task project', slug: 'tasks', taskPrefix: 'TASK' })
      .expect(201)
  ).body;
  const other = (
    await send(owner, 'post', base + '/projects')
      .send({ name: 'Other', slug: 'other', taskPrefix: 'OTHER' })
      .expect(201)
  ).body;
  const path = `${base}/projects/${project.id}`;
  const tasks = path + '/tasks';
  const statuses = (await send(member, 'get', path + '/statuses').expect(200))
    .body;
  const foreignStatus = await prisma.taskStatus.findFirstOrThrow({
    where: { projectId: other.id },
  });
  const tag = (
    await send(member, 'post', path + '/tags')
      .send({ name: 'Feature', branchPrefix: 'feat' })
      .expect(201)
  ).body;
  const foreignTag = await prisma.taskTag.create({
    data: { projectId: other.id, name: 'Other', branchPrefix: 'fix' },
  });
  await send(invited, 'get', tasks).expect(404);
  await send(outsider, 'get', tasks).expect(404);
  for (const body of [
    { title: 'foreign status', statusId: foreignStatus.id },
    { title: 'foreign tag', tagId: foreignTag.id },
    {
      title: 'org member only',
      assignments: [{ userId: invited.id, kind: 'ASSIGNEE' }],
    },
    {
      title: 'implicit owner',
      assignments: [{ userId: owner.id, kind: 'ASSIGNEE' }],
    },
  ])
    await send(member, 'post', tasks).send(body).expect(404);
  assert.equal(
    await prisma.task.count({ where: { projectId: project.id } }),
    0,
  );
  assert.equal(
    (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
      .lastTaskNumber,
    0,
  );
  const assignment = { userId: member.id, kind: 'ASSIGNEE' };
  for (const body of [
    { title: ' ' },
    { title: 'bad', expectedRevision: 1 },
    { title: 'bad', assignments: [assignment, assignment] },
    { title: 'bad', assignments: [null] },
    { title: 'bad', assignments: [[assignment]] },
    { title: 'bad', description: 'bad\0text' },
    { title: 'bad', dueAt: '2026-W47-4T12:00:00Z' },
    { title: 'bad', statusId: null },
    { title: 'bad', dueAt: '2026-02-30T12:00:00Z' },
  ])
    await send(member, 'post', tasks).send(body).expect(400);
  let task = (
    await send(member, 'post', tasks)
      .send({
        title: ' Initial task ',
        description: '# Markdown\n![image](https://example.test/image.png)',
        tagId: tag.id,
        dueAt: '2026-12-01T12:00:00+03:00',
        assignments: [assignment],
      })
      .expect(201)
  ).body;
  assert.equal(task.key, 'TASK-1');
  assert.equal(task.suggestedBranch, 'feat/TASK-1');
  assert.equal(task.title, 'Initial task');
  assert.equal(task.dueAt, '2026-12-01T09:00:00.000Z');
  assert.equal(task.revision, 1);
  assert.equal(task.creatorId, member.id);
  assert.equal(
    task.statusId,
    statuses.find((s) => s.category === 'BACKLOG').id,
  );
  const url = tasks + '/' + task.id;
  const get = async () => (await send(member, 'get', url).expect(200)).body;
  const events = async () =>
    (await send(member, 'get', url + '/history').expect(200)).body.items;
  assert.deepEqual(task.assignments, [assignment]);
  assert.equal((await events())[0].kind, 'CREATED');
  assert.equal((await events())[0].actorId, member.id);
  await send(owner, 'get', url).expect(200); // implicit owner read/write access
  for (const actor of [invited, outsider]) {
    await send(actor, 'get', url).expect(404);
    await send(actor, 'get', url + '/history').expect(404);
    await send(actor, 'patch', url)
      .send({ expectedRevision: 1, title: 'forbidden' })
      .expect(404);
  }
  await send(
    owner,
    'get',
    `${base}/projects/${other.id}/tasks/${task.id}`,
  ).expect(404);
  await send(member, 'get', `${tasks}/${randomUUID()}`).expect(404);
  await send(member, 'get', tasks + '/not-uuid').expect(400);
  await send(member, 'patch', url)
    .send({ title: 'missing revision' })
    .expect(400);
  await send(member, 'patch', url)
    .send({ expectedRevision: 1, description: null })
    .expect(400);
  await send(member, 'patch', url)
    .send({
      expectedRevision: 1,
      statusId: foreignStatus.id,
      title: 'must rollback',
    })
    .expect(404);
  assert.equal((await get()).title, task.title);
  assert.equal((await events()).length, 1);
  task = (
    await send(owner, 'patch', url)
      .send({ expectedRevision: 1, title: 'Changed' })
      .expect(200)
  ).body;
  assert.equal(task.revision, 2);
  assert.equal(
    task.description,
    '# Markdown\n![image](https://example.test/image.png)',
  );
  assert.equal(task.tagId, tag.id);
  assert.ok(task.dueAt);
  const stale = await send(member, 'patch', url)
    .send({ expectedRevision: 1, title: 'stale' })
    .expect(409);
  assert.equal(stale.body.code, 'TASK_REVISION_CONFLICT');
  assert.ok(stale.body.requestId);
  await send(member, 'patch', url)
    .send({ expectedRevision: 2, title: 'Changed' })
    .expect(200);
  assert.equal((await events()).length, 2); // no-op creates no event
  task = (
    await send(member, 'patch', url)
      .send({ expectedRevision: 2, tagId: null, dueAt: null, description: '' })
      .expect(200)
  ).body;
  assert.equal(task.tagId, null);
  assert.equal(task.dueAt, null);
  assert.equal(task.suggestedBranch, null);
  assert.equal(task.description, '');
  const races = await Promise.all(
    ['Winner A', 'Winner B'].map((title) =>
      send(member, 'patch', url).send({
        expectedRevision: task.revision,
        title,
      }),
    ),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
  task = await get();
  assert.equal(task.revision, 4);
  const fullSet = [assignment, { ...assignment, kind: 'REVIEWER' }];
  task = (
    await send(member, 'put', url + '/assignments')
      .send({ expectedRevision: task.revision, assignments: fullSet })
      .expect(200)
  ).body;
  assert.equal(task.assignments.length, 2);
  const revision = task.revision;
  await send(member, 'put', url + '/assignments')
    .send({ expectedRevision: revision, assignments: [...fullSet].reverse() })
    .expect(200);
  assert.equal((await get()).revision, revision);
  assert.equal((await events()).length, revision);
  await send(member, 'put', url + '/assignments')
    .send({
      expectedRevision: revision,
      assignments: [{ userId: outsider.id, kind: 'REVIEWER' }],
    })
    .expect(404);
  assert.equal((await get()).revision, revision);
  task = (
    await send(member, 'put', url + '/assignments')
      .send({ expectedRevision: revision, assignments: [] })
      .expect(200)
  ).body;
  assert.deepEqual(task.assignments, []);
  assert.equal((await events()).at(-1).changes.removed.length, 2);
  task = (
    await send(member, 'post', url + '/archive')
      .send({ expectedRevision: task.revision })
      .expect(200)
  ).body;
  assert.ok(task.archivedAt);
  const archivedRevision = task.revision;
  await send(member, 'post', url + '/archive')
    .send({ expectedRevision: task.revision })
    .expect(200);
  assert.equal((await get()).revision, archivedRevision);
  await send(member, 'patch', url)
    .send({ expectedRevision: task.revision, title: 'archived' })
    .expect(409);
  await send(member, 'put', url + '/assignments')
    .send({ expectedRevision: task.revision, assignments: [assignment] })
    .expect(409);
  assert.equal(
    (await send(member, 'get', tasks).expect(200)).body.items.length,
    0,
  );
  assert.equal(
    (await send(member, 'get', tasks + '?archive=archived').expect(200)).body
      .items[0].id,
    task.id,
  );
  await send(member, 'post', path + '/archive').expect(200);
  await send(member, 'post', url + '/restore')
    .send({ expectedRevision: task.revision })
    .expect(409);
  await send(member, 'post', tasks)
    .send({ title: 'archived project' })
    .expect(409);
  await send(member, 'get', url + '/history').expect(200);
  await send(member, 'post', path + '/restore').expect(200);
  task = (
    await send(member, 'post', url + '/restore')
      .send({ expectedRevision: task.revision })
      .expect(200)
  ).body;
  assert.equal(task.archivedAt, null);
  const batch = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      send(member, 'post', tasks)
        .send({
          title: `Concurrent ${i}`,
          tagId: tag.id,
          assignments: [assignment],
        })
        .expect(201),
    ),
  );
  assert.deepEqual(
    batch.map((r) => r.body.number).sort((a, b) => a - b),
    [2, 3, 4, 5, 6, 7],
  );
  assert.equal(
    await prisma.taskEvent.count({
      where: { taskId: { in: batch.map((r) => r.body.id) } },
    }),
    6,
  );
  const page = (await send(member, 'get', tasks + '?limit=2').expect(200)).body;
  assert.deepEqual(
    page.items.map((t) => t.number),
    [1, 2],
  );
  assert.equal(page.nextCursor, 2);
  assert.equal(page.items[0].description, undefined);
  const page2 = (
    await send(member, 'get', tasks + '?limit=2&after=2').expect(200)
  ).body;
  assert.deepEqual(
    page2.items.map((t) => t.number),
    [3, 4],
  );
  const filtered = (
    await send(
      member,
      'get',
      `${tasks}?q=concurrent&tagId=${tag.id}&memberId=${member.id}&assignmentKind=ASSIGNEE&statusId=${task.statusId}`,
    ).expect(200)
  ).body;
  assert.equal(filtered.items.length, 6);
  assert.equal(
    (await send(member, 'get', tasks + '?assignmentKind=REVIEWER').expect(200))
      .body.items.length,
    0,
  );
  assert.equal(
    (await send(member, 'get', tasks + '?q=%25').expect(200)).body.items.length,
    0,
  );
  const literal = (
    await send(member, 'post', tasks)
      .send({ title: '100%_literal\\title' })
      .expect(201)
  ).body;
  assert.equal(
    (
      await send(
        member,
        'get',
        tasks + '?q=' + encodeURIComponent('%_literal\\'),
      ).expect(200)
    ).body.items[0].id,
    literal.id,
  );
  await send(member, 'get', tasks + '?limit=101').expect(400);
  await send(member, 'get', tasks + '?unknown=1').expect(400);
  const history = (
    await send(member, 'get', url + '/history?limit=2').expect(200)
  ).body;
  assert.equal(history.nextCursor, 2);
  assert.deepEqual(
    (
      await send(member, 'get', url + '/history?limit=2&after=2').expect(200)
    ).body.items.map((e) => e.revision),
    [3, 4],
  );
  // A real SQL failure after the task/assignments write must roll back the entire operation.
  const beforeFailure = await get();
  const eventCount = await prisma.taskEvent.count({
    where: { taskId: task.id },
  });
  const counter = (
    await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
  ).lastTaskNumber;
  await migrator.query(`
    CREATE FUNCTION app.reject_task_event_for_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected event failure'; END; $$;
    CREATE TRIGGER reject_task_event_for_test BEFORE INSERT ON app."TaskEvent"
    FOR EACH ROW EXECUTE FUNCTION app.reject_task_event_for_test();
  `);
  try {
    const failed = await send(member, 'patch', url)
      .send({
        expectedRevision: beforeFailure.revision,
        title: 'must not commit',
      })
      .expect(500);
    assert.equal(failed.body.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(failed.body).includes('injected'));
    await send(member, 'put', url + '/assignments')
      .send({
        expectedRevision: beforeFailure.revision,
        assignments: [assignment],
      })
      .expect(500);
    await send(member, 'post', tasks)
      .send({ title: 'must not consume number' })
      .expect(500);
  } finally {
    await migrator.query(
      'DROP TRIGGER reject_task_event_for_test ON app."TaskEvent"; DROP FUNCTION app.reject_task_event_for_test();',
    );
  }
  assert.deepEqual(await get(), beforeFailure);
  assert.equal(
    await prisma.taskEvent.count({ where: { taskId: task.id } }),
    eventCount,
  );
  assert.equal(
    (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
      .lastTaskNumber,
    counter,
  );
  const beforeMove = await get();
  const destination = statuses.find((s) => s.id !== beforeMove.statusId);
  await send(member, 'delete', path + '/statuses/' + beforeMove.statusId)
    .send({ replacementStatusId: destination.id })
    .expect(204);
  task = await get();
  assert.equal(task.revision, beforeMove.revision + 1);
  assert.equal(task.statusId, destination.id);
  assert.equal((await events()).at(-1).kind, 'STATUS_REPLACED');
  await send(member, 'patch', url)
    .send({ expectedRevision: beforeMove.revision, title: 'stale after move' })
    .expect(409);
  await send(member, 'post', path + '/members')
    .send({ userId: invited.id })
    .expect(201);
  task = (
    await send(member, 'put', url + '/assignments')
      .send({
        expectedRevision: task.revision,
        assignments: [
          { userId: invited.id, kind: 'ASSIGNEE' },
          { userId: invited.id, kind: 'REVIEWER' },
        ],
      })
      .expect(200)
  ).body;
  const beforeRemoval = task.revision;
  await send(member, 'delete', path + '/members/' + invited.id).expect(204);
  task = await get();
  assert.deepEqual(task.assignments, []);
  assert.equal(task.revision, beforeRemoval + 1);
  assert.equal((await events()).at(-1).kind, 'MEMBER_REMOVED');
  assert.equal((await events()).at(-1).changes.removed.length, 2);
  await send(invited, 'get', url + '/history').expect(404);
  await send(member, 'put', url + '/assignments')
    .send({ expectedRevision: beforeRemoval, assignments: [] })
    .expect(409);
  // Cascading organization removal invalidates all affected tasks, even in archived projects.
  await send(member, 'post', path + '/members')
    .send({ userId: invited.id })
    .expect(201);
  task = (
    await send(member, 'put', url + '/assignments')
      .send({
        expectedRevision: task.revision,
        assignments: [{ userId: invited.id, kind: 'RESPONSIBLE' }],
      })
      .expect(200)
  ).body;
  await send(member, 'post', path + '/archive').expect(200);
  await send(owner, 'delete', base + '/members/' + invited.id).expect(204);
  const afterOrgRemoval = await get();
  assert.equal(afterOrgRemoval.revision, task.revision + 1);
  assert.deepEqual(afterOrgRemoval.assignments, []);
  await send(member, 'post', path + '/restore').expect(200);
  // Explicit owner participation may be removed without losing implicit access.
  await send(owner, 'post', path + '/members')
    .send({ userId: owner.id })
    .expect(201);
  task = (
    await send(owner, 'put', url + '/assignments')
      .send({
        expectedRevision: afterOrgRemoval.revision,
        assignments: [{ userId: owner.id, kind: 'ASSIGNEE' }],
      })
      .expect(200)
  ).body;
  await send(owner, 'post', path + '/leave').expect(204);
  assert.equal((await get()).revision, task.revision + 1);
  assert.deepEqual((await get()).assignments, []);
  const allEvents = await prisma.taskEvent.findMany({
    where: { taskId: task.id },
    orderBy: { revision: 'asc' },
  });
  assert.deepEqual(
    allEvents.map((e) => e.revision),
    Array.from({ length: (await get()).revision }, (_, i) => i + 1),
  );
  assert.ok(
    allEvents.every((e) => !JSON.stringify(e.changes).includes('# Markdown')),
  );
  const assignedTaskUrl = tasks + '/' + batch[0].body.id;
  const beforeLeave = (await send(member, 'get', assignedTaskUrl).expect(200))
    .body;
  await send(member, 'post', base + '/leave').expect(204);
  await send(member, 'get', assignedTaskUrl).expect(404);
  const afterLeave = (await send(owner, 'get', assignedTaskUrl).expect(200))
    .body;
  assert.deepEqual(afterLeave.assignments, []);
  assert.equal(afterLeave.revision, beforeLeave.revision + 1);
  assert.equal(
    (
      await prisma.taskEvent.findFirstOrThrow({
        where: { taskId: afterLeave.id },
        orderBy: { revision: 'desc' },
      })
    ).kind,
    'MEMBER_REMOVED',
  );
  // Domain cleanup is isolated to this fixture; no public task deletion endpoint exists.
  await prisma.organization.delete({ where: { id: org.id } });
  assert.equal(await prisma.taskEvent.count({ where: { taskId: task.id } }), 0);
  console.log(
    'PASS: task HTTP contracts, atomic history, stale writes, numbering, filters, archive and member/status cleanup',
  );
}
