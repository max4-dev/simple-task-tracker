import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function checkBoardScenarios({
  app,
  send,
  prisma,
  migrator,
  owner,
  member,
  outsider,
  invited,
}) {
  console.log(
    'Checking: board ordering, exact positions, paginated snapshots and lock isolation',
  );
  const org = (
    await send(owner, 'post', '/organizations')
      .send({ name: 'Board', slug: 'board-tests' })
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
      .send({ name: 'Board', slug: 'board', taskPrefix: 'BRD' })
      .expect(201)
  ).body;
  const other = (
    await send(owner, 'post', base + '/projects')
      .send({ name: 'Other', slug: 'other', taskPrefix: 'OTH' })
      .expect(201)
  ).body;
  const path = `${base}/projects/${project.id}`;
  const otherPath = `${base}/projects/${other.id}`;
  const board = async (query = '') =>
    (await send(member, 'get', path + '/board' + query).expect(200)).body;
  const initial = await board();
  const [a, b, c] = initial.columns;
  assert.equal(initial.totalColumns, 5);
  assert.ok(
    initial.columns.every(
      (s) => s.cards.items.length === 0 && s.cards.total === 0,
    ),
  );
  await send(invited, 'get', path + '/board').expect(404);
  await send(outsider, 'get', path + '/board').expect(404);
  const columnUrl = (id) => `${path}/board/columns/${id}/tasks`;
  const column = async (id, query = '') =>
    (await send(member, 'get', columnUrl(id) + query).expect(200)).body;
  const create = async (title, statusId = a.id) =>
    (
      await send(member, 'post', path + '/tasks')
        .send({ title, statusId })
        .expect(201)
    ).body;
  const get = async (id) =>
    (await send(member, 'get', path + '/tasks/' + id).expect(200)).body;
  const move = (task, statusId, previousTaskId, nextTaskId, actor = member) =>
    send(actor, 'post', path + '/tasks/' + task.id + '/move').send({
      expectedRevision: task.revision,
      statusId,
      previousTaskId,
      nextTaskId,
    });
  const ids = (cards) => cards.items.map((t) => t.id);
  const x = await create('First');
  let y = await create('Second');
  const z = await create('Third');
  assert.deepEqual(ids(await column(a.id)), [x.id, y.id, z.id]);
  assert.equal(x.position, '1024.000000000000000');
  assert.equal(y.position, '2048.000000000000000');
  const first = await column(a.id, '?limit=1');
  assert.equal(first.total, 3);
  const second = await column(
    a.id,
    '?limit=1&after=' + encodeURIComponent(first.nextCursor),
  );
  assert.deepEqual(ids(second), [y.id]);
  const third = await column(
    a.id,
    '?limit=1&after=' + encodeURIComponent(second.nextCursor),
  );
  assert.deepEqual(ids(third), [z.id]);
  assert.equal(third.nextCursor, null);
  const boardPage = await board('?columnLimit=1&cardLimit=1');
  assert.equal(boardPage.columns.length, 1);
  assert.equal(boardPage.columns[0].cards.items.length, 1);
  assert.equal(boardPage.columns[0].cards.total, 3);
  assert.equal(
    (
      await board(
        '?columnLimit=1&afterColumn=' +
          encodeURIComponent(boardPage.nextColumnCursor),
      )
    ).columns[0].id,
    b.id,
  );
  await send(
    member,
    'get',
    columnUrl(b.id) + '?after=' + encodeURIComponent(first.nextCursor),
  ).expect(400);
  await send(
    member,
    'get',
    columnUrl(a.id) + '?q=First&after=' + encodeURIComponent(first.nextCursor),
  ).expect(400);
  await send(member, 'get', columnUrl(a.id) + '?after=malformed').expect(400);
  await send(member, 'get', path + '/board?cardLimit=51').expect(400);
  await send(member, 'post', path + '/tasks/' + y.id + '/move')
    .send({ expectedRevision: y.revision, statusId: a.id })
    .expect(400);
  const beforeNoop = (await board()).boardRevision;
  await move(y, a.id, x.id, z.id).expect(200);
  assert.equal((await get(y.id)).revision, y.revision);
  assert.equal((await board()).boardRevision, beforeNoop);
  const moved = (await move(y, a.id, null, x.id).expect(200)).body;
  y = moved.task;
  assert.equal(y.revision, 2);
  assert.deepEqual(ids(await column(a.id)), [y.id, x.id, z.id]);
  assert.equal(
    (
      await send(
        member,
        'get',
        columnUrl(a.id) + '?after=' + encodeURIComponent(first.nextCursor),
      ).expect(409)
    ).body.code,
    'BOARD_CHANGED',
  );
  const history = await prisma.taskEvent.findMany({
    where: { taskId: y.id },
    orderBy: { revision: 'asc' },
  });
  assert.equal(history.at(-1).kind, 'MOVED');
  await move({ ...y, revision: 1 }, b.id, null, null).expect(409);
  await move(y, a.id, y.id, x.id).expect(400);
  await move(y, a.id, null, z.id).expect(409); // hidden x is still a real neighbor
  assert.deepEqual(ids(await column(a.id, '?q=Third')), [z.id]);
  assert.deepEqual(ids(await column(a.id)), [y.id, x.id, z.id]);
  const foreignStatus = await prisma.taskStatus.findFirstOrThrow({
    where: { projectId: other.id },
  });
  const foreign = (
    await send(owner, 'post', otherPath + '/tasks')
      .send({ title: 'Other' })
      .expect(201)
  ).body;
  await move(y, foreignStatus.id, null, null).expect(404);
  await move(y, b.id, foreign.id, null).expect(404);
  await move(y, b.id, x.id, null).expect(404);
  y = (await move(y, b.id, null, null).expect(200)).body.task;
  assert.deepEqual(ids(await column(b.id)), [y.id]);
  const archived = (
    await send(member, 'post', path + '/tasks/' + z.id + '/archive')
      .send({ expectedRevision: z.revision })
      .expect(200)
  ).body;
  await move(archived, b.id, y.id, null).expect(409);
  await move(y, a.id, x.id, z.id).expect(404);
  const restored = (
    await send(member, 'post', path + '/tasks/' + z.id + '/restore')
      .send({ expectedRevision: archived.revision })
      .expect(200)
  ).body;
  assert.deepEqual(ids(await column(a.id)), [x.id, z.id]);
  const changed = (
    await send(member, 'patch', path + '/tasks/' + restored.id)
      .send({ expectedRevision: restored.revision, statusId: b.id })
      .expect(200)
  ).body;
  assert.deepEqual(ids(await column(b.id)), [y.id, changed.id]);

  // Exhausted 10^-15 gap and boundary overflow must rebalance without rounding or collateral task revisions.
  const left = await create('Left', c.id);
  const right = await create('Right', c.id);
  await prisma.task.update({
    where: { id: left.id },
    data: { position: '999999999999998.999999999999991' },
  });
  await prisma.task.update({
    where: { id: right.id },
    data: { position: '999999999999998.999999999999992' },
  });
  y = (await move(y, c.id, left.id, right.id).expect(200)).body.task;
  assert.deepEqual(ids(await column(c.id)), [left.id, y.id, right.id]);
  assert.equal(y.position, '1536.000000000000000');
  assert.equal((await get(left.id)).revision, left.revision);
  assert.equal((await get(right.id)).revision, right.revision);
  await prisma.task.update({
    where: { id: right.id },
    data: { position: '999999999999999.999999999999999' },
  });
  const appended = await create('Overflow append', c.id);
  assert.deepEqual(ids(await column(c.id)), [
    left.id,
    y.id,
    right.id,
    appended.id,
  ]);
  assert.equal(appended.position, '4096.000000000000000');

  // Simultaneous moves of one card and two cards into the same gap.
  const race = await create('Race');
  const results = await Promise.all([
    move(race, b.id, null, changed.id),
    move(race, c.id, null, left.id),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const one = await create('One');
  const two = await create('Two');
  const competing = await Promise.all([
    move(one, c.id, right.id, appended.id),
    move(two, c.id, right.id, appended.id),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  const allCards = (await board('?cardLimit=50')).columns.flatMap(
    (s) => s.cards.items,
  );
  assert.equal(
    new Set(allCards.map((t) => t.id)).size,
    await prisma.task.count({
      where: { projectId: project.id, archivedAt: null },
    }),
  );

  // Atomic full column ordering, stale revision, mismatched set, cursor invalidation.
  const current = await board();
  const statusIds = current.columns.map((s) => s.id).reverse();
  await send(member, 'put', path + '/board/columns/order')
    .send({
      expectedBoardRevision: current.boardRevision,
      statusIds: statusIds.slice(1),
    })
    .expect(409);
  await send(member, 'put', path + '/board/columns/order')
    .send({
      expectedBoardRevision: current.boardRevision,
      statusIds: [...statusIds.slice(1), foreignStatus.id],
    })
    .expect(409);
  const reorder = (
    await send(member, 'put', path + '/board/columns/order')
      .send({ expectedBoardRevision: current.boardRevision, statusIds })
      .expect(200)
  ).body;
  assert.deepEqual(
    (await board()).columns.map((s) => s.id),
    statusIds,
  );
  await send(member, 'put', path + '/board/columns/order')
    .send({
      expectedBoardRevision: current.boardRevision,
      statusIds: statusIds.reverse(),
    })
    .expect(409);
  const noReorder = await send(member, 'put', path + '/board/columns/order')
    .send({
      expectedBoardRevision: reorder.boardRevision,
      statusIds: reorder.statusIds,
    })
    .expect(200);
  assert.equal(noReorder.body.boardRevision, reorder.boardRevision);

  // A forced event failure rolls back move, board version and any rebalance.
  const failTask = await get(x.id);
  const tightGap = (await column(c.id)).items.slice(0, 2);
  await prisma.task.update({
    where: { id: tightGap[0].id },
    data: { position: '0' },
  });
  await prisma.task.update({
    where: { id: tightGap[1].id },
    data: { position: '0.000000000000001' },
  });
  const beforeFailure = await board('?cardLimit=50');
  await migrator.query(`CREATE FUNCTION app.reject_board_event_for_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected event failure'; END; $$;
    CREATE TRIGGER reject_board_event_for_test BEFORE INSERT ON app."TaskEvent" FOR EACH ROW EXECUTE FUNCTION app.reject_board_event_for_test();`);
  try {
    await move(failTask, c.id, tightGap[0].id, tightGap[1].id).expect(500);
  } finally {
    await migrator.query(
      'DROP TRIGGER reject_board_event_for_test ON app."TaskEvent"; DROP FUNCTION app.reject_board_event_for_test();',
    );
  }
  assert.deepEqual(await board('?cardLimit=50'), beforeFailure);

  // Destination order stays first; source order is appended and all source revisions/history advance.
  const targetBefore = await column(c.id);
  const sourceBefore = await column(b.id);
  await send(member, 'delete', path + '/statuses/' + b.id)
    .send({ replacementStatusId: c.id })
    .expect(204);
  assert.deepEqual(ids(await column(c.id)), [
    ...ids(targetBefore),
    ...ids(sourceBefore),
  ]);
  for (const card of sourceBefore.items) {
    const updated = await get(card.id);
    assert.equal(updated.revision, card.revision + 1);
    assert.equal(
      (
        await prisma.taskEvent.findFirstOrThrow({
          where: { taskId: card.id },
          orderBy: { revision: 'desc' },
        })
      ).kind,
      'STATUS_REPLACED',
    );
  }

  // Concurrent move versus status deletion: either move commits first or its revision is rejected.
  const temporary = (
    await send(member, 'post', path + '/statuses')
      .send({ name: 'Temporary' })
      .expect(201)
  ).body;
  const disappearing = await create('Status race', temporary.id);
  const firstInTarget = (await column(c.id)).items[0].id;
  const statusRace = await Promise.all([
    move(disappearing, c.id, null, firstInTarget),
    send(owner, 'delete', path + '/statuses/' + temporary.id).send({
      replacementStatusId: c.id,
    }),
  ]);
  assert.equal(statusRace[1].status, 204);
  assert.ok([200, 409].includes(statusRace[0].status));
  assert.equal((await get(disappearing.id)).statusId, c.id);
  assert.equal(
    (await get(disappearing.id)).revision,
    disappearing.revision + 1,
  );
  // Concurrent explicit membership removal versus a member's move.
  await send(owner, 'post', path + '/members')
    .send({ userId: invited.id })
    .expect(201);
  const removingTask = await create('Membership race');
  const memberRace = await Promise.all([
    move(removingTask, c.id, null, (await column(c.id)).items[0].id, invited),
    send(owner, 'delete', path + '/members/' + invited.id),
  ]);
  assert.equal(memberRace[1].status, 204);
  assert.ok([200, 404].includes(memberRace[0].status));
  await move(await get(removingTask.id), c.id, null, null, invited).expect(404);
  await send(member, 'patch', path + '/statuses/' + a.id)
    .send({ position: 42 })
    .expect(400);

  // Hold a real project transaction open. Another project's HTTP writes must finish before release.
  const { ProjectAccessService } =
    await import('../dist/modules/project/project-access.service.js');
  const access = app.get(ProjectAccessService);
  async function holdProject(operation = async () => {}) {
    let enter, release;
    const started = new Promise((resolve) => {
      enter = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let pid;
    const finished = access.mutate(org.id, project.id, owner.id, async (tx) => {
      pid = (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;
      await operation(tx);
      enter();
      await gate;
    });
    await Promise.race([started, finished]);
    return {
      pid,
      release: async () => {
        release();
        await finished;
      },
    };
  }
  async function bounded(promise, milliseconds = 1500) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Independent project blocked')),
            milliseconds,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function waitBlocked(pid) {
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      const result = await migrator.query(
        'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
        [pid],
      );
      if (result.rows[0].blocked) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.fail('Expected operation to wait for held project lock');
  }
  const held = await holdProject();
  let pending;
  try {
    const parallel = await bounded(
      Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          send(owner, 'patch', otherPath + '/tasks/' + foreign.id).send({
            expectedRevision: foreign.revision,
            title: 'Parallel ' + i,
          }),
        ),
      ),
    );
    assert.deepEqual(
      parallel.map((r) => r.status).sort(),
      [200, 409, 409, 409, 409, 409],
    );
    pending = move(
      await get(x.id),
      a.id,
      null,
      (await column(a.id)).items.find((t) => t.id !== x.id)?.id ?? null,
    ).then((r) => r);
    await waitBlocked(held.pid);
  } finally {
    await held.release();
  }
  assert.equal((await pending).status, 200);

  // A queued move rechecks project archive after obtaining the lock.
  const archiveGate = await holdProject(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date() },
    });
  });
  let blockedMove;
  try {
    blockedMove = move(await get(x.id), a.id, null, null).then((r) => r);
    await waitBlocked(archiveGate.pid);
  } finally {
    await archiveGate.release();
  }
  assert.equal((await blockedMove).status, 409);
  await send(owner, 'get', path + '/board').expect(200);
  await send(owner, 'put', path + '/board/columns/order')
    .send({
      expectedBoardRevision: (await board()).boardRevision,
      statusIds: (await board()).columns.map((s) => s.id),
    })
    .expect(409);
  await send(owner, 'post', path + '/restore').expect(200);

  // Organization removal needs the exclusive org lock, so it waits for the active project mutation.
  const membershipGate = await holdProject();
  let removing;
  try {
    removing = send(owner, 'delete', base + '/members/' + member.id).then(
      (r) => r,
    );
    await waitBlocked(membershipGate.pid);
  } finally {
    await membershipGate.release();
  }
  assert.equal((await removing).status, 204);
  await move(
    await prisma.task.findUniqueOrThrow({ where: { id: x.id } }),
    a.id,
    null,
    null,
  ).expect(404);
  await send(member, 'get', path + '/board').expect(404);
  await send(owner, 'get', path + '/board').expect(200);
  await prisma.organization.delete({ where: { id: org.id } });
  console.log(
    'PASS: board pages/cursors, moves/rebalance/history, status ordering, real lock waits and independent projects',
  );
}
