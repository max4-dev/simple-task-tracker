import type { Prisma } from '../../../generated/prisma/client.js';

export const taskSummarySelect = {
  id: true,
  projectId: true,
  number: true,
  revision: true,
  position: true,
  title: true,
  statusId: true,
  tagId: true,
  creatorId: true,
  dueAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  tag: { select: { branchPrefix: true } },
  assignments: {
    select: { userId: true, kind: true },
    orderBy: [{ userId: 'asc' }, { kind: 'asc' }],
  },
} satisfies Prisma.TaskSelect;
export const taskSelect = {
  ...taskSummarySelect,
  description: true,
} satisfies Prisma.TaskSelect;

export function presentTask<
  T extends Prisma.TaskGetPayload<{ select: typeof taskSummarySelect }>,
>(task: T, prefix: string) {
  const { tag, ...result } = task;
  const key = `${prefix}-${task.number}`;
  return {
    ...result,
    key,
    position: task.position.toFixed(15),
    suggestedBranch: tag ? `${tag.branchPrefix}/${key}` : null,
  };
}
