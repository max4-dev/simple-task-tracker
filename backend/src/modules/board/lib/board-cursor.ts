import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { BoardFiltersDto } from '../dto/board.dto.js';

export function boardChanged(): never {
  throw new ConflictException({
    code: 'BOARD_CHANGED',
    message: 'Доска изменилась. Обновите её перед продолжением',
  });
}
export function boardFilter(query: BoardFiltersDto): Prisma.TaskWhereInput {
  return {
    archivedAt: null,
    tagId: query.tagId,
    ...(query.q
      ? {
          title: {
            contains: query.q.replace(/[\\%_]/g, '\\$&'),
            mode: 'insensitive' as const,
          },
        }
      : {}),
    ...(query.memberId || query.assignmentKind
      ? {
          assignments: {
            some: { userId: query.memberId, kind: query.assignmentKind },
          },
        }
      : {}),
  };
}
export function filterKey(query: BoardFiltersDto) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        query.tagId ?? null,
        query.memberId ?? null,
        query.assignmentKind ?? null,
        query.q ?? null,
      ]),
    )
    .digest('hex');
}
type Cursor = {
  v: 1;
  project: string;
  column: string;
  revision: number;
  filter: string;
  position: string;
  id: string;
};
export function encodeBoardCursor(data: Omit<Cursor, 'v'>): string {
  return Buffer.from(JSON.stringify({ v: 1, ...data })).toString('base64url');
}
export function decodeBoardCursor(
  raw: string | undefined,
  scope: Pick<Cursor, 'project' | 'column' | 'revision' | 'filter'>,
): Cursor | null {
  if (raw === undefined) return null;
  let cursor: Cursor;
  try {
    if (!raw || raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw))
      throw new Error();
    cursor = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Cursor;
    if (
      !cursor ||
      cursor.v !== 1 ||
      cursor.project !== scope.project ||
      cursor.column !== scope.column ||
      cursor.filter !== scope.filter ||
      !Number.isInteger(cursor.revision) ||
      cursor.revision < 1 ||
      typeof cursor.id !== 'string' ||
      !isUUID(cursor.id, '4') ||
      typeof cursor.position !== 'string' ||
      !/^-?\d{1,15}(?:\.\d{1,15})?$/.test(cursor.position)
    )
      throw new Error();
    if (scope.column === 'columns' && !/^\d{1,7}$/.test(cursor.position))
      throw new Error();
  } catch {
    throw new BadRequestException('Некорректный курсор доски');
  }
  if (cursor.revision !== scope.revision) boardChanged();
  return cursor;
}
