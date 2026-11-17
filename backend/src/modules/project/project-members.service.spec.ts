import { presentProjectMember } from './project-members.service.js';

describe('visual project role', () => {
  const role = (id: string) => ({ id, name: id, description: null });
  const member = () => ({
    userId: 'member',
    joinedAt: new Date('2026-01-01'),
    roleId: null,
    role: null,
    member: {
      role: role('Fullstack'),
      user: { name: 'Ada', email: 'ada@example.test', avatarUrl: null },
    },
  });
  it('inherits the current organization role without copying its ID', () => {
    const input = member();
    expect(presentProjectMember(input, 'owner')).toMatchObject({
      roleSource: 'organization',
      projectRoleId: null,
      role: { id: 'Fullstack' },
    });
    input.member.role = role('Backend');
    expect(presentProjectMember(input, 'owner').role.id).toBe('Backend');
  });
  it('uses an explicit project specialization until cleared', () => {
    expect(
      presentProjectMember(
        { ...member(), roleId: 'Designer', role: role('Designer') },
        'owner',
      ),
    ).toMatchObject({ roleSource: 'project', role: { id: 'Designer' } });
  });
  it('supports members without a visual role', () => {
    const input = member();
    input.member.role = null;
    expect(presentProjectMember(input, 'owner')).toMatchObject({
      role: null,
      roleSource: 'none',
    });
  });
  it('keeps the system owner distinct from visual roles', () => {
    expect(presentProjectMember(member(), 'member')).toMatchObject({
      roleSource: 'owner',
      role: { name: 'owner', isSystem: true },
    });
  });
});
