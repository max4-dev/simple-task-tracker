import type {
  Prisma,
  TaskStatusCategory,
} from '../../../generated/prisma/client.js';

export const projectSelect = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  description: true,
  taskPrefix: true,
  lastTaskNumber: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

export const INITIAL_STATUSES: {
  name: string;
  category: TaskStatusCategory;
  color: string;
  position: number;
}[] = [
  { name: 'Бэклог', category: 'BACKLOG', color: '#64748b', position: 0 },
  { name: 'К работе', category: 'TODO', color: '#3b82f6', position: 1 },
  { name: 'В работе', category: 'IN_PROGRESS', color: '#eab308', position: 2 },
  { name: 'Ревью', category: 'REVIEW', color: '#a855f7', position: 3 },
  { name: 'Готово', category: 'DONE', color: '#22c55e', position: 4 },
];
