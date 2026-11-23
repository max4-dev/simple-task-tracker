import { Prisma } from '../../generated/prisma/client.js';

// Decimal.js defaults to 20 significant digits. Numeric(30,15) needs exact scaled integers.
export const POSITION_SCALE = 10n ** 15n;
export const POSITION_STEP = 1024n * POSITION_SCALE;
export const POSITION_MAX = 10n ** 30n - 1n;
export function positionUnits(value: Prisma.Decimal): bigint {
  return BigInt(value.toFixed(15).replace('.', ''));
}
export function positionDecimal(value: bigint): Prisma.Decimal {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(16, '0');
  return new Prisma.Decimal(
    `${sign}${digits.slice(0, -15)}.${digits.slice(-15)}`,
  );
}
export function positionBetween(
  left: Prisma.Decimal | null,
  right: Prisma.Decimal | null,
): Prisma.Decimal | null {
  const lo = left === null ? null : positionUnits(left);
  const hi = right === null ? null : positionUnits(right);
  const candidate =
    lo === null
      ? hi === null
        ? POSITION_STEP
        : hi - POSITION_STEP
      : hi === null
        ? lo + POSITION_STEP
        : (lo + hi) / 2n;
  if (
    candidate < -POSITION_MAX ||
    candidate > POSITION_MAX ||
    (lo !== null && candidate <= lo) ||
    (hi !== null && candidate >= hi)
  )
    return null;
  return positionDecimal(candidate);
}

// Caller owns the project lock. Relative order and task revisions stay unchanged.
export async function rebalanceTaskPositions(
  tx: Prisma.TransactionClient,
  projectId: string,
  statusId: string,
  excludeId?: string,
) {
  await tx.$executeRaw`
    WITH ranked AS (
      SELECT "id", row_number() OVER (ORDER BY "position", "id") * 1024 AS position
      FROM "app"."Task" WHERE "projectId" = ${projectId} AND "statusId" = ${statusId} AND "archivedAt" IS NULL
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
    ) UPDATE "app"."Task" t SET "position" = r.position FROM ranked r WHERE t."id" = r."id"
  `;
}
export async function appendTaskPosition(
  tx: Prisma.TransactionClient,
  projectId: string,
  statusId: string,
  excludeId?: string,
) {
  const last = () =>
    tx.task.findFirst({
      where: {
        projectId,
        statusId,
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { position: true },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  let position = positionBetween((await last())?.position ?? null, null);
  if (!position) {
    await rebalanceTaskPositions(tx, projectId, statusId, excludeId);
    position = positionBetween((await last())?.position ?? null, null);
  }
  if (!position) throw new Error('Task position capacity exceeded');
  return position;
}
