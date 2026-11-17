import { OWNER_ROLE, page, requireOwner } from './organization-permissions.js';

describe('organization system owner', () => {
  it('allows only the current owner to perform owner-only actions', () => {
    expect(() =>
      requireOwner({ userId: 'owner', isOwner: true }),
    ).not.toThrow();
    expect(() => requireOwner({ userId: 'member', isOwner: false })).toThrow();
  });
  it('does not represent owner as an editable custom role', () => {
    expect(OWNER_ROLE).toMatchObject({
      id: null,
      name: 'owner',
      isSystem: true,
    });
  });
});
describe('keyset page', () => {
  it('uses the last returned item as a cursor only if another item exists', () => {
    expect(page([{ id: 'a' }, { id: 'b' }], 1, (item) => item.id)).toEqual({
      items: [{ id: 'a' }],
      nextCursor: 'a',
    });
    expect(page([{ id: 'a' }], 1, (item) => item.id).nextCursor).toBeNull();
    expect(page([], 20, (item: { id: string }) => item.id)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
