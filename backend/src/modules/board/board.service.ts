import { TaskMutationService } from '../task/task-mutation.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  positionBetween,
  rebalanceTaskPositions,
} from '../../common/database/task-order.js';
import { ProjectAccessService } from '../project/project-access.service.js';
import type {
  BoardColumnQueryDto,
  BoardQueryDto,
  MoveTaskDto,
  ReorderColumnsDto,
} from './dto/board.dto.js';
import {
  boardChanged,
  boardFilter,
  decodeBoardCursor,
  encodeBoardCursor,
  filterKey,
} from './lib/board-cursor.js';
import {
  presentTask,
  taskSelect,
  taskSummarySelect,
} from '../task/lib/task-presenter.js';

const orderBy = [{ position: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class BoardService {
  constructor(
    private readonly access: ProjectAccessService,
    private readonly mutations: TaskMutationService,
  ) {}

  private async revision(tx: Prisma.TransactionClient, projectId: string) {
    return (
      await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { boardRevision: true },
      })
    ).boardRevision;
  }

  private async cards(
    tx: Prisma.TransactionClient,
    project: string,
    statusId: string,
    prefix: string,
    revision: number,
    query: BoardColumnQueryDto,
  ) {
    const scope = {
      project,
      column: statusId,
      revision,
      filter: filterKey(query),
    };
    const cursor = decodeBoardCursor(query.after, scope);
    const where = { projectId: project, statusId, ...boardFilter(query) };
    const rows = await tx.task.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { position: { gt: cursor.position } },
                { position: cursor.position, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [...orderBy],
      select: taskSummarySelect,
      take: query.limit + 1,
    });
    const items = rows
      .slice(0, query.limit)
      .map((task) => presentTask(task, prefix));
    const last = items.at(-1);
    return {
      boardRevision: revision,
      total: await tx.task.count({ where }),
      items,
      nextCursor:
        rows.length > query.limit && last
          ? encodeBoardCursor({
              ...scope,
              position: last.position,
              id: last.id,
            })
          : null,
    };
  }

  get(org: string, project: string, user: string, query: BoardQueryDto) {
    return this.access.read(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const revision = await this.revision(tx, project);
        const scope = {
          project,
          column: 'columns',
          revision,
          filter: filterKey(query),
        };
        const cursor = decodeBoardCursor(query.afterColumn, scope);
        const rows = await tx.taskStatus.findMany({
          where: {
            projectId: project,
            ...(cursor
              ? {
                  OR: [
                    { position: { gt: Number(cursor.position) } },
                    {
                      position: Number(cursor.position),
                      id: { gt: cursor.id },
                    },
                  ],
                }
              : {}),
          },
          orderBy: [...orderBy],
          take: query.columnLimit + 1,
        });
        const columns = [];
        for (const status of rows.slice(0, query.columnLimit)) {
          columns.push({
            ...status,
            cards: await this.cards(
              tx,
              project,
              status.id,
              context.taskPrefix,
              revision,
              { ...query, limit: query.cardLimit },
            ),
          });
        }
        const last = columns.at(-1);
        return {
          boardRevision: revision,
          totalColumns: await tx.taskStatus.count({
            where: { projectId: project },
          }),
          columns,
          nextColumnCursor:
            rows.length > query.columnLimit && last
              ? encodeBoardCursor({
                  ...scope,
                  position: String(last.position),
                  id: last.id,
                })
              : null,
        };
      },
    );
  }

  column(
    org: string,
    project: string,
    user: string,
    statusId: string,
    query: BoardColumnQueryDto,
  ) {
    return this.access.read(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const status = await tx.taskStatus.findUnique({
          where: { projectId_id: { projectId: project, id: statusId } },
          select: { id: true },
        });
        if (!status) throw new NotFoundException('Колонка не найдена');
        return this.cards(
          tx,
          project,
          statusId,
          context.taskPrefix,
          await this.revision(tx, project),
          query,
        );
      },
    );
  }

  move(
    org: string,
    project: string,
    user: string,
    taskId: string,
    dto: MoveTaskDto,
  ) {
    return this.access.mutate(
      org,
      project,
      user,
      async (tx, { project: context }) => {
        const task = await this.mutations.get(tx, project, taskId);
        this.mutations.checkRevision(task, dto.expectedRevision);
        this.mutations.checkActive(task, 'Задача в архиве');
        if (
          dto.previousTaskId === taskId ||
          dto.nextTaskId === taskId ||
          (dto.previousTaskId !== null && dto.previousTaskId === dto.nextTaskId)
        )
          throw new BadRequestException('Соседние задачи должны различаться');
        if (
          !(await tx.taskStatus.findUnique({
            where: { projectId_id: { projectId: project, id: dto.statusId } },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Колонка не найдена');
        const neighbor = async (id: string | null) => {
          if (id === null) return null;
          const row = await tx.task.findFirst({
            where: {
              id,
              projectId: project,
              statusId: dto.statusId,
              archivedAt: null,
            },
            select: { id: true, position: true },
          });
          if (!row)
            throw new NotFoundException(
              'Соседняя карточка не найдена в целевой колонке',
            );
          return row;
        };
        let previous = await neighbor(dto.previousTaskId);
        let next = await neighbor(dto.nextTaskId);
        const actualNext = await tx.task.findFirst({
          where: {
            projectId: project,
            statusId: dto.statusId,
            archivedAt: null,
            id: { not: taskId },
            ...(previous
              ? {
                  OR: [
                    { position: { gt: previous.position } },
                    { position: previous.position, id: { gt: previous.id } },
                  ],
                }
              : {}),
          },
          orderBy: [...orderBy],
          select: { id: true },
        });
        if ((actualNext?.id ?? null) !== dto.nextTaskId) boardChanged();
        if (
          task.statusId === dto.statusId &&
          (!previous || task.position.gt(previous.position)) &&
          (!next || task.position.lt(next.position))
        )
          return {
            task: presentTask(task, context.taskPrefix),
            boardRevision: await this.revision(tx, project),
          };
        let position = positionBetween(
          previous?.position ?? null,
          next?.position ?? null,
        );
        if (!position) {
          await rebalanceTaskPositions(tx, project, dto.statusId, taskId);
          previous = await neighbor(dto.previousTaskId);
          next = await neighbor(dto.nextTaskId);
          position = positionBetween(
            previous?.position ?? null,
            next?.position ?? null,
          );
        }
        if (!position)
          throw new ConflictException(
            'Недостаточно места для позиции карточки',
          );
        const updated = await tx.task.update({
          where: {
            id: taskId,
            projectId: project,
            revision: dto.expectedRevision,
          },
          data: {
            statusId: dto.statusId,
            position,
            revision: { increment: 1 },
          },
          select: taskSelect,
        });
        await this.mutations.record(tx, updated, user, 'MOVED', {
          fromStatusId: task.statusId,
          toStatusId: dto.statusId,
          previousTaskId: dto.previousTaskId,
          nextTaskId: dto.nextTaskId,
        });
        return {
          task: presentTask(updated, context.taskPrefix),
          boardRevision: await this.revision(tx, project),
        };
      },
    );
  }

  reorderColumns(
    org: string,
    project: string,
    user: string,
    dto: ReorderColumnsDto,
  ) {
    return this.access.mutate(org, project, user, async (tx) => {
      if ((await this.revision(tx, project)) !== dto.expectedBoardRevision)
        boardChanged();
      const statuses = await tx.taskStatus.findMany({
        where: { projectId: project },
        orderBy: [...orderBy],
        select: { id: true },
      });
      const requested = new Set(dto.statusIds);
      if (
        statuses.length !== dto.statusIds.length ||
        requested.size !== statuses.length ||
        statuses.some((s) => !requested.has(s.id))
      )
        boardChanged();
      if (statuses.some((s, i) => s.id !== dto.statusIds[i])) {
        // One statement: readers never observe a partially reordered board.
        await tx.$executeRaw`UPDATE "app"."TaskStatus" s SET "position" = wanted.position::integer - 1
          FROM unnest(ARRAY[${Prisma.join(dto.statusIds)}]::text[]) WITH ORDINALITY AS wanted(id, position)
          WHERE s."projectId" = ${project} AND s."id" = wanted.id`;
      }
      return {
        boardRevision: await this.revision(tx, project),
        statusIds: dto.statusIds,
      };
    });
  }
}
