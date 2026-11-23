import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import {
  positionBetween,
  positionUnits,
  positionDecimal,
  POSITION_MAX,
} from '../../common/database/task-order.js';
import {
  decodeBoardCursor,
  encodeBoardCursor,
  filterKey,
} from './lib/board-cursor.js';
import {
  BoardColumnQueryDto,
  MoveTaskDto,
  ReorderColumnsDto,
} from './dto/board.dto.js';

const d = (n: string) => new Prisma.Decimal(n);
describe('exact board positions', () => {
  it('keeps all 30 digits without Decimal arithmetic rounding', () => {
    const lo = d('999999999999998.999999999999991');
    const hi = d('999999999999998.999999999999999');
    expect(positionBetween(lo, hi)?.toFixed(15)).toBe(
      '999999999999998.999999999999995',
    );
  });
  it('detects exhausted gaps, duplicates and numeric boundaries', () => {
    expect(
      positionBetween(d('1.000000000000001'), d('1.000000000000002')),
    ).toBeNull();
    expect(positionBetween(d('0'), d('0'))).toBeNull();
    expect(positionBetween(positionDecimal(POSITION_MAX), null)).toBeNull();
    expect(positionBetween(null, positionDecimal(-POSITION_MAX))).toBeNull();
  });
  it('handles negative positions, empty columns and exact round trips', () => {
    expect(positionBetween(d('-2'), d('-1'))?.toFixed(15)).toBe(
      '-1.500000000000000',
    );
    expect(positionBetween(null, null)?.toFixed(15)).toBe(
      '1024.000000000000000',
    );
    for (const value of [POSITION_MAX, -POSITION_MAX, 0n, 1n, -1n])
      expect(positionUnits(positionDecimal(value))).toBe(value);
  });
});

describe('board cursors', () => {
  const scope = {
    project: randomUUID(),
    column: randomUUID(),
    revision: 4,
    filter: filterKey({}),
  };
  const cursor = encodeBoardCursor({
    ...scope,
    position: '1024.000000000000001',
    id: randomUUID(),
  });
  it('preserves exact decimal position', () =>
    expect(decodeBoardCursor(cursor, scope)?.position).toBe(
      '1024.000000000000001',
    ));
  it('rejects stale versions separately from mismatched scope', () => {
    expect(() => decodeBoardCursor(cursor, { ...scope, revision: 5 })).toThrow(
      'Доска изменилась',
    );
    expect(() =>
      decodeBoardCursor(cursor, { ...scope, project: randomUUID() }),
    ).toThrow('Некорректный курсор');
    expect(() =>
      decodeBoardCursor(cursor, { ...scope, column: randomUUID() }),
    ).toThrow('Некорректный курсор');
    expect(() =>
      decodeBoardCursor(cursor, {
        ...scope,
        filter: filterKey({ q: 'other' }),
      }),
    ).toThrow('Некорректный курсор');
  });
  it.each([
    '',
    'bad!',
    Buffer.from('null').toString('base64url'),
    'x'.repeat(1025),
  ])('rejects malformed input %#', (raw) =>
    expect(() => decodeBoardCursor(raw, scope)).toThrow('Некорректный курсор'),
  );
});

describe('board DTOs', () => {
  const valid = {
    expectedRevision: 1,
    statusId: randomUUID(),
    previousTaskId: null,
    nextTaskId: null,
  };
  it('requires both explicit neighbor boundaries', async () => {
    expect(await validate(plainToInstance(MoveTaskDto, valid))).toEqual([]);
    const { previousTaskId: _previous, ...missing } = valid;
    void _previous;
    expect(
      (await validate(plainToInstance(MoveTaskDto, missing))).length,
    ).toBeGreaterThan(0);
  });
  it('rejects duplicate or empty column order', async () => {
    const id = randomUUID();
    for (const ids of [[], [id, id], ['bad']])
      expect(
        (
          await validate(
            plainToInstance(ReorderColumnsDto, {
              expectedBoardRevision: 1,
              statusIds: ids,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
  });
  it('bounds page size and cursor length', async () => {
    for (const input of [
      { limit: 0 },
      { limit: 51 },
      { after: 'x'.repeat(1025) },
    ])
      expect(
        (await validate(plainToInstance(BoardColumnQueryDto, input))).length,
      ).toBeGreaterThan(0);
  });
});
