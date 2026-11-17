import { canViewProject } from './project-visibility.js';

describe('project membership visibility', () => {
  it('always permits the organization owner without explicit project membership', () => {
    expect(canViewProject('owner', 'owner', [])).toBe(true);
  });
  it('permits an explicit member regardless of their visual role', () => {
    expect(canViewProject('member', 'owner', [{ userId: 'member' }])).toBe(
      true,
    );
  });
  it('does not expose a project to other organization members or outsiders', () => {
    expect(canViewProject('other', 'owner', [{ userId: 'member' }])).toBe(
      false,
    );
  });
  it('immediately removes access after project membership ends', () => {
    expect(canViewProject('member', 'owner', [])).toBe(false);
  });
});
