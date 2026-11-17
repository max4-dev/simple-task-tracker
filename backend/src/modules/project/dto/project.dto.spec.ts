import { ValidationPipe } from '@nestjs/common';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  DeleteProjectDto,
  ProjectPageQueryDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
} from './project.dto.js';
import {
  CreateProjectStatusDto,
  CreateProjectTagDto,
  DeleteProjectStatusDto,
  UpdateProjectStatusDto,
  UpdateProjectTagDto,
} from './project-board.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const parse = (metatype: new () => unknown, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });
const validProject = { name: 'Web', slug: 'web-app', taskPrefix: 'task-WEB' };

describe('project validation', () => {
  it('normalizes project fields and defaults to active projects', async () => {
    await expect(
      parse(CreateProjectDto, {
        ...validProject,
        name: ' Web ',
        description: null,
      }),
    ).resolves.toMatchObject({ name: 'Web', description: null });
    await expect(parse(ProjectPageQueryDto, {})).resolves.toMatchObject({
      state: 'active',
      limit: 20,
    });
    await expect(
      parse(ProjectPageQueryDto, { state: 'archived', limit: '5' }),
    ).resolves.toMatchObject({ state: 'archived', limit: 5 });
  });
  it.each([
    { name: '' },
    { name: ' ' },
    { slug: 'UPPER' },
    { slug: 'a' },
    { taskPrefix: '1WEB' },
    { taskPrefix: 'WEB/' },
    { taskPrefix: 'WEB--API' },
    { taskPrefix: 'W'.repeat(33) },
    { organizationId: 'other' },
    { lastTaskNumber: 99 },
    { archivedAt: '2026-01-01' },
    { members: [{ userId: 'other' }] },
  ])('rejects invalid or internal fields: %j', async (value) => {
    await expect(
      parse(CreateProjectDto, { ...validProject, ...value }),
    ).rejects.toThrow();
  });
  it('preserves partial updates and only allows null description', async () => {
    await expect(
      parse(UpdateProjectDto, { description: null }),
    ).resolves.toHaveProperty('description', null);
    for (const field of ['name', 'slug', 'taskPrefix'])
      await expect(
        parse(UpdateProjectDto, { [field]: null }),
      ).rejects.toThrow();
    await expect(
      parse(UpdateProjectDto, { organizationId: 'other' }),
    ).rejects.toThrow();
  });
  it('rejects invalid state and pagination', async () => {
    for (const body of [
      { state: null },
      { state: 'deleted' },
      { limit: 0 },
      { limit: 101 },
    ])
      await expect(parse(ProjectPageQueryDto, body)).rejects.toThrow();
  });
  it('requires an explicit role or null for a role update and an existing member UUID to add', async () => {
    await expect(parse(UpdateProjectMemberRoleDto, {})).rejects.toThrow();
    await expect(
      parse(UpdateProjectMemberRoleDto, { roleId: null }),
    ).resolves.toHaveProperty('roleId', null);
    await expect(
      parse(UpdateProjectMemberRoleDto, { roleId: 'owner' }),
    ).rejects.toThrow();
    await expect(
      parse(AddProjectMemberDto, {
        userId: 'b2f56686-60f0-4b8a-b9e5-a33e5803db7d',
      }),
    ).resolves.toHaveProperty('userId');
    await expect(
      parse(AddProjectMemberDto, { userId: '123', roleId: null }),
    ).rejects.toThrow();
    await expect(
      parse(AddProjectMemberDto, {
        userId: 'b2f56686-60f0-4b8a-b9e5-a33e5803db7d',
        allowPermissions: ['VIEW_PROJECT'],
      }),
    ).rejects.toThrow();
  });
  it('requires a password when deleting', async () => {
    await expect(parse(DeleteProjectDto, {})).rejects.toThrow();
    await expect(
      parse(DeleteProjectDto, { password: 'current-password' }),
    ).resolves.toHaveProperty('password');
  });
});

describe('project board configuration validation', () => {
  it('does not reset category/color/position on a partial status update', async () => {
    const result = await parse(UpdateProjectStatusDto, { name: 'Review' });
    expect(result).toMatchObject({ name: 'Review' });
    expect(result.category).toBeUndefined();
    expect(result.color).toBeUndefined();
    expect(result.position).toBeUndefined();
  });
  it.each([
    { name: '' },
    { color: 'red' },
    { category: 'UNKNOWN' },
    { position: -1 },
    { position: 0.5 },
    { position: 1000001 },
    { name: null },
    { category: null },
    { color: null },
    { position: null },
  ])('rejects invalid status fields: %j', async (body) => {
    await expect(parse(UpdateProjectStatusDto, body)).rejects.toThrow();
  });
  it('validates status creation and replacement UUIDs', async () => {
    await expect(
      parse(CreateProjectStatusDto, {
        name: 'Review',
        category: 'REVIEW',
        color: '#aabbcc',
        position: 3,
      }),
    ).resolves.toHaveProperty('category', 'REVIEW');
    await expect(parse(DeleteProjectStatusDto, {})).resolves.toBeInstanceOf(
      DeleteProjectStatusDto,
    );
    await expect(
      parse(DeleteProjectStatusDto, { replacementStatusId: 'other' }),
    ).rejects.toThrow();
  });
  it('accepts safe tag prefixes and rejects null/unsafe values', async () => {
    await expect(
      parse(CreateProjectTagDto, { name: 'Feature', branchPrefix: 'feat' }),
    ).resolves.toHaveProperty('branchPrefix', 'feat');
    for (const branchPrefix of ['feat/other', '../bad', 'UPPER', '', null])
      await expect(
        parse(UpdateProjectTagDto, { branchPrefix }),
      ).rejects.toThrow();
    await expect(
      parse(UpdateProjectTagDto, { projectId: 'other' }),
    ).rejects.toThrow();
  });
});
