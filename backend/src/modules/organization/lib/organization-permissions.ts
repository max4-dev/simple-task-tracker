import { ForbiddenException } from '@nestjs/common';

export type OrganizationActor = { userId: string; isOwner: boolean };

export const OWNER_ROLE = {
  id: null,
  name: 'owner',
  description: null,
  isSystem: true,
};

export function requireOwner(actor: OrganizationActor): void {
  if (!actor.isOwner)
    throw new ForbiddenException('Действие доступно только owner');
}

export function page<T>(rows: T[], limit: number, key: (row: T) => string) {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? key(items[items.length - 1]) : null,
  };
}
