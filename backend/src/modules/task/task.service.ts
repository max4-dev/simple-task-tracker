import { TaskMutationService } from './task-mutation.service.js';
import { appendTaskPosition } from '../../common/database/task-order.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ProjectAccessService } from '../project/project-access.service.js';
import type {
  CreateTaskDto,
  ListTasksQueryDto,
  ReplaceTaskAssignmentsDto,
  TaskAssignmentInputDto,
  TaskPageQueryDto,
  TaskRevisionDto,
  UpdateTaskDto,
} from './dto/task-input.dto.js';
import {
  presentTask,
  taskSelect,
  taskSummarySelect,
} from './lib/task-presenter.js';

const assignmentKey = (item: TaskAssignmentInputDto) =>
  `${item.userId}:${item.kind}`;

export function assignmentDifference(
  before: TaskAssignmentInputDto[],
  after: TaskAssignmentInputDto[],
) {
  const previous = new Set(before.map(assignmentKey));
  const next = new Set(after.map(assignmentKey));
  return {
    added: after.filter((a) => !previous.has(assignmentKey(a))),
    removed: before.filter((a) => !next.has(assignmentKey(a))),
  };
}

function paginate<T>(items: T[], limit: number, key: (item: T) => number) {
  const more = items.length > limit;
  const result = items.slice(0, limit);
  return {
    items: result,
    nextCursor: more ? key(result[result.length - 1]) : null,
  };
}

@Injectable()
export class TaskService {
  constructor(
    private readonly access: ProjectAccessService,
    private readonly mutations: TaskMutationService,
  ) {}

  private async checkReferences(
    tx: Prisma.TransactionClient,
    projectId: string,
    dto: { statusId?: string; tagId?: string | null },
  ) {
    if (
      dto.statusId &&
      !(await tx.taskStatus.findUnique({
        where: { projectId_id: { projectId, id: dto.statusId } },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Статус проекта не найден');
    if (
      dto.tagId &&
      !(await tx.taskTag.findUnique({
        where: { projectId_id: { projectId, id: dto.tagId } },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Тег проекта не найден');
  }

  private async checkMembers(
    tx: Prisma.TransactionClient,
    projectId: string,
    assignments: TaskAssignmentInputDto[],
  ) {
    const ids = [...new Set(assignments.map((a) => a.userId))];
    if (!ids.length) return;
    const count = await tx.projectMember.count({
      where: { projectId, userId: { in: ids } },
    });
    if (count !== ids.length)
      throw new NotFoundException('Участник проекта не найден');
  }

  create(org: string, project: string, user: string, dto: CreateTaskDto) {
    return this.access.mutate(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        await this.checkReferences(tx, project, dto);
        const assignments = dto.assignments ?? [];
        await this.checkMembers(tx, project, assignments);
        let statusId = dto.statusId;
        if (!statusId) {
          const orderBy = [{ position: 'asc' }, { id: 'asc' }] as const;
          const status =
            (await tx.taskStatus.findFirst({
              where: { projectId: project, category: 'BACKLOG' },
              orderBy: [...orderBy],
            })) ??
            (await tx.taskStatus.findFirst({
              where: { projectId: project },
              orderBy: [...orderBy],
            }));
          if (!status) throw new ConflictException('В проекте нет статусов');
          statusId = status.id;
        }
        const task = await tx.task.create({
          data: {
            projectId: project,
            title: dto.title,
            description: dto.description,
            statusId,
            tagId: dto.tagId,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
            creatorId: user,
            position: await appendTaskPosition(tx, project, statusId),
          },
          select: taskSelect,
        });
        if (assignments.length)
          await tx.taskAssignment.createMany({
            data: assignments.map((a) => ({
              projectId: project,
              taskId: task.id,
              userId: a.userId,
              kind: a.kind,
            })),
          });
        await this.mutations.record(tx, task, user, 'CREATED', {
          statusId,
          tagId: task.tagId,
          assignments: assignments.map((a) => ({
            userId: a.userId,
            kind: a.kind,
          })),
        });
        return presentTask(
          await this.mutations.get(tx, project, task.id),
          context.taskPrefix,
        );
      },
    );
  }

  list(org: string, project: string, user: string, query: ListTasksQueryDto) {
    return this.access.read(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const tasks = await tx.task.findMany({
          where: {
            projectId: project,
            ...(query.after ? { number: { gt: query.after } } : {}),
            ...(query.archive === 'all'
              ? {}
              : {
                  archivedAt: query.archive === 'active' ? null : { not: null },
                }),
            statusId: query.statusId,
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
                    some: {
                      userId: query.memberId,
                      kind: query.assignmentKind,
                    },
                  },
                }
              : {}),
          },
          select: taskSummarySelect,
          orderBy: { number: 'asc' },
          take: query.limit + 1,
        });
        return paginate(
          tasks.map((task) => presentTask(task, context.taskPrefix)),
          query.limit,
          (task) => task.number,
        );
      },
    );
  }

  get(org: string, project: string, user: string, id: string) {
    return this.access.read(
      org,
      project,
      user,
      async (tx, { project: context }) =>
        presentTask(
          await this.mutations.get(tx, project, id),
          context.taskPrefix,
        ),
    );
  }

  update(
    org: string,
    project: string,
    user: string,
    id: string,
    dto: UpdateTaskDto,
  ) {
    return this.access.mutate(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const task = await this.mutations.get(tx, project, id);
        this.mutations.checkRevision(task, dto.expectedRevision);
        this.mutations.checkActive(task);
        await this.checkReferences(tx, project, dto);
        const data: Prisma.TaskUpdateInput = {};
        const fields: string[] = [];
        if (dto.title !== undefined && dto.title !== task.title) {
          data.title = dto.title;
          fields.push('title');
        }
        if (
          dto.description !== undefined &&
          dto.description !== task.description
        ) {
          data.description = dto.description;
          fields.push('description');
        }
        // Scalar foreign keys are applied below with the unchecked update input after scoped validation.
        const statusId =
          dto.statusId !== undefined && dto.statusId !== task.statusId
            ? dto.statusId
            : undefined;
        const tagId =
          dto.tagId !== undefined && dto.tagId !== task.tagId
            ? dto.tagId
            : undefined;
        if (statusId !== undefined) fields.push('statusId');
        if (tagId !== undefined) fields.push('tagId');
        const dueAt =
          dto.dueAt === undefined
            ? undefined
            : dto.dueAt === null
              ? null
              : new Date(dto.dueAt);
        if (
          dueAt !== undefined &&
          (dueAt?.getTime() ?? null) !== (task.dueAt?.getTime() ?? null)
        ) {
          data.dueAt = dueAt;
          fields.push('dueAt');
        }
        if (!fields.length) return presentTask(task, context.taskPrefix);
        const updated = await tx.task.update({
          where: { id, projectId: project, revision: dto.expectedRevision },
          data: {
            title: data.title,
            description: data.description,
            dueAt: data.dueAt,
            statusId,
            tagId,
            position: statusId
              ? await appendTaskPosition(tx, project, statusId, id)
              : undefined,
            revision: { increment: 1 },
          },
          select: taskSelect,
        });
        await this.mutations.record(tx, updated, user, 'UPDATED', {
          fields,
          ...(statusId
            ? { fromStatusId: task.statusId, toStatusId: statusId }
            : {}),
          ...(tagId !== undefined
            ? { fromTagId: task.tagId, toTagId: tagId }
            : {}),
        });
        return presentTask(updated, context.taskPrefix);
      },
    );
  }

  replaceAssignments(
    org: string,
    project: string,
    user: string,
    id: string,
    dto: ReplaceTaskAssignmentsDto,
  ) {
    return this.access.mutate(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const task = await this.mutations.get(tx, project, id);
        this.mutations.checkRevision(task, dto.expectedRevision);
        this.mutations.checkActive(task);
        await this.checkMembers(tx, project, dto.assignments);
        const { added, removed } = assignmentDifference(
          task.assignments,
          dto.assignments,
        );
        if (!added.length && !removed.length)
          return presentTask(task, context.taskPrefix);
        if (removed.length)
          await tx.taskAssignment.deleteMany({
            where: {
              taskId: id,
              projectId: project,
              OR: removed.map((a) => ({ userId: a.userId, kind: a.kind })),
            },
          });
        if (added.length)
          await tx.taskAssignment.createMany({
            data: added.map((a) => ({
              projectId: project,
              taskId: id,
              userId: a.userId,
              kind: a.kind,
            })),
          });
        const updated = await tx.task.update({
          where: { id, projectId: project, revision: dto.expectedRevision },
          data: { revision: { increment: 1 } },
          select: taskSelect,
        });
        await this.mutations.record(tx, updated, user, 'ASSIGNMENTS_CHANGED', {
          added: added.map((a) => ({ ...a })),
          removed: removed.map((a) => ({ ...a })),
        });
        return presentTask(updated, context.taskPrefix);
      },
    );
  }

  archive(
    org: string,
    project: string,
    user: string,
    id: string,
    dto: TaskRevisionDto,
    archived: boolean,
  ) {
    return this.access.mutate(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const task = await this.mutations.get(tx, project, id);
        this.mutations.checkRevision(task, dto.expectedRevision);
        if (Boolean(task.archivedAt) === archived)
          return presentTask(task, context.taskPrefix);
        const updated = await tx.task.update({
          where: { id, projectId: project, revision: dto.expectedRevision },
          data: {
            archivedAt: archived ? new Date() : null,
            position: archived
              ? undefined
              : await appendTaskPosition(tx, project, task.statusId, id),
            revision: { increment: 1 },
          },
          select: taskSelect,
        });
        await this.mutations.record(
          tx,
          updated,
          user,
          archived ? 'ARCHIVED' : 'RESTORED',
          {},
        );
        return presentTask(updated, context.taskPrefix);
      },
    );
  }

  history(
    org: string,
    project: string,
    user: string,
    id: string,
    query: TaskPageQueryDto,
  ) {
    return this.access.read(org, project, user, async (tx) => {
      const task = await tx.task.findUnique({
        where: { projectId_id: { projectId: project, id } },
        select: { id: true },
      });
      if (!task) throw new NotFoundException('Задача не найдена');
      const events = await tx.taskEvent.findMany({
        where: {
          taskId: id,
          ...(query.after ? { revision: { gt: query.after } } : {}),
        },
        orderBy: { revision: 'asc' },
        take: query.limit + 1,
      });
      return paginate(events, query.limit, (event) => event.revision);
    });
  }
}
