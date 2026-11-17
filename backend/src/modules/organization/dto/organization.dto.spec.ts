import { ValidationPipe } from '@nestjs/common';
import {
  AssignOrganizationRoleDto,
  CreateOrganizationDto,
  CreateOrganizationRoleDto,
  DeleteOrganizationDto,
  PageQueryDto,
  TransferOwnershipDto,
  UpdateOrganizationRoleDto,
} from './organization.dto.js';
import { AcceptInvitationDto, CreateInvitationDto } from './invitation.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const parse = (metatype: new () => unknown, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('organization input validation', () => {
  it('normalizes names and uses bounded pagination', async () => {
    await expect(
      parse(CreateOrganizationDto, { name: '  Team  ', slug: 'my-team' }),
    ).resolves.toMatchObject({ name: 'Team', slug: 'my-team' });
    await expect(parse(PageQueryDto, {})).resolves.toMatchObject({ limit: 20 });
    await expect(parse(PageQueryDto, { limit: '100' })).resolves.toMatchObject({
      limit: 100,
    });
  });
  it.each([
    { name: '', slug: 'team' },
    { name: '  ', slug: 'team' },
    { name: 'Team', slug: 'Bad Slug' },
    { name: 'Team', slug: 'a' },
    { name: 'Team', slug: 'team', ownerUserId: 'someone-else' },
  ])('rejects invalid organization: %j', async (value) => {
    await expect(parse(CreateOrganizationDto, value)).rejects.toThrow();
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 'x' },
    { limit: 1.5 },
    { after: 'not-uuid' },
  ])('rejects invalid pagination: %j', async (value) => {
    await expect(parse(PageQueryDto, value)).rejects.toThrow();
  });
  it('does not expose permission configuration while roles are visual', async () => {
    await expect(
      parse(CreateOrganizationRoleDto, {
        name: 'Frontend',
        organizationPermissions: ['MANAGE_MEMBERS'],
      }),
    ).rejects.toThrow();
    await expect(
      parse(UpdateOrganizationRoleDto, { projectPermissions: [] }),
    ).rejects.toThrow();
    await expect(
      parse(UpdateOrganizationRoleDto, { name: null }),
    ).rejects.toThrow();
    await expect(
      parse(UpdateOrganizationRoleDto, { description: null }),
    ).resolves.toHaveProperty('description', null);
  });
  it('requires an explicit role ID or null when assigning a role', async () => {
    await expect(parse(AssignOrganizationRoleDto, {})).rejects.toThrow();
    await expect(
      parse(AssignOrganizationRoleDto, { roleId: 'owner' }),
    ).rejects.toThrow();
    await expect(
      parse(AssignOrganizationRoleDto, { roleId: null }),
    ).resolves.toHaveProperty('roleId', null);
  });
  it('requires a target member and current password for the respective owner actions', async () => {
    await expect(
      parse(TransferOwnershipDto, { userId: '1' }),
    ).rejects.toThrow();
    await expect(
      parse(DeleteOrganizationDto, { password: '' }),
    ).rejects.toThrow();
    await expect(
      parse(DeleteOrganizationDto, { password: 'current-password' }),
    ).resolves.toHaveProperty('password', 'current-password');
  });
  it('normalizes invitation email and validates opaque tokens', async () => {
    await expect(
      parse(CreateInvitationDto, {
        email: ' ADA@EXAMPLE.COM ',
        roleId: 'b2f56686-60f0-4b8a-b9e5-a33e5803db7d',
      }),
    ).resolves.toHaveProperty('email', 'ada@example.com');
    await expect(
      parse(AcceptInvitationDto, { token: 'a'.repeat(64) }),
    ).resolves.toHaveProperty('token');
    await expect(
      parse(AcceptInvitationDto, { token: 'short' }),
    ).rejects.toThrow();
    await expect(
      parse(AcceptInvitationDto, { token: 'z'.repeat(64) }),
    ).rejects.toThrow();
    await expect(
      parse(CreateInvitationDto, { email: 'bad', roleId: 'owner' }),
    ).rejects.toThrow();
  });
});
