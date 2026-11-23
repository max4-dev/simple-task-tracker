import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  ReplaceTaskAssignmentsDto,
  TaskRevisionDto,
  UpdateTaskDto,
} from './dto/task-input.dto.js';
import { assignmentDifference } from './task.service.js';

const invalid = async (type: new () => object, body: object) =>
  (
    await validate(plainToInstance(type, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).length > 0;

describe('task input contracts', () => {
  it.each([
    {},
    { title: ' ' },
    { title: 'ok', description: null },
    { title: 'ok', statusId: null },
    { title: 'ok', assignments: null },
    { title: 'ok', assignments: [null] },
    {
      title: 'ok',
      assignments: [[{ userId: randomUUID(), kind: 'ASSIGNEE' }]],
    },
    { title: 'ok', dueAt: '2026-W47-4T12:00:00Z' },
    { title: 'ok', dueAt: '2026-323T12:00:00Z' },
    { title: 'ok', number: 1 },
    { title: 'bad\0title' },
    { title: 'ok', description: 'bad\0text' },
    { title: 'ok', dueAt: '0000-01-01T12:00:00Z' },
    { title: 'ok', revision: 1 },
    { title: 'ok', dueAt: '2026-02-30T12:00:00Z' },
    { title: 'ok', dueAt: '2026-11-19' },
    { title: 'ok', dueAt: '2026-11-19T12:00:00' },
    { title: 'ok', description: 'x'.repeat(50001) },
    { title: 'ok', assignments: [{ userId: randomUUID(), kind: 'OWNER' }] },
  ])('rejects invalid creation %#', async (body) => {
    expect(await invalid(CreateTaskDto, body)).toBe(true);
  });

  it('accepts explicit null only for clearable fields and trims title', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      title: ' Task ',
      tagId: null,
      dueAt: null,
      description: '',
      assignments: [],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.title).toBe('Task');
    expect(
      await invalid(UpdateTaskDto, {
        expectedRevision: 1,
        tagId: null,
        dueAt: null,
      }),
    ).toBe(false);
    expect(
      await invalid(UpdateTaskDto, { expectedRevision: 1, title: null }),
    ).toBe(true);
    expect(
      await invalid(UpdateTaskDto, { expectedRevision: 1, description: null }),
    ).toBe(true);
  });

  it.each([
    {},
    { expectedRevision: '1' },
    { expectedRevision: 0 },
    { expectedRevision: 1.5 },
    { expectedRevision: 2147483648 },
  ])('requires integer revision %#', async (body) => {
    expect(await invalid(TaskRevisionDto, body)).toBe(true);
  });

  it('rejects duplicate assignments but permits several responsibilities per member', async () => {
    const assignment = { userId: randomUUID(), kind: 'ASSIGNEE' };
    expect(
      await invalid(ReplaceTaskAssignmentsDto, {
        expectedRevision: 1,
        assignments: [assignment, assignment],
      }),
    ).toBe(true);
    expect(
      await invalid(ReplaceTaskAssignmentsDto, {
        expectedRevision: 1,
        assignments: [assignment, { ...assignment, kind: 'REVIEWER' }],
      }),
    ).toBe(false);
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { after: '-1' },
    { archive: 'false' },
    { q: '' },
    { q: 'bad\0text' },
    { memberId: 'not-uuid' },
  ])('rejects invalid pagination/filter %#', async (query) => {
    expect(await invalid(ListTasksQueryDto, query)).toBe(true);
  });

  it('uses bounded defaults and numeric cursors', async () => {
    const dto = plainToInstance(ListTasksQueryDto, { after: '12' });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ limit: 20, archive: 'active', after: 12 });
  });
});

describe('assignment set comparison', () => {
  const a = { userId: randomUUID(), kind: 'ASSIGNEE' as const };
  const r = { userId: a.userId, kind: 'REVIEWER' as const };
  it('ignores ordering and keeps multiple kinds distinct', () => {
    expect(assignmentDifference([a, r], [r, a])).toEqual({
      added: [],
      removed: [],
    });
    expect(assignmentDifference([a], [r])).toEqual({
      added: [r],
      removed: [a],
    });
  });
});
