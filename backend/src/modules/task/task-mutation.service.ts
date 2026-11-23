import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TaskEventKind } from '../../generated/prisma/client.js';
import { taskSelect } from './lib/task-presenter.js';

// Shared task invariants; callers provide the transaction authorized and locked by ProjectAccessService.
// No nested transaction: mutation, history and notification outbox must commit together.
@Injectable()
export class TaskMutationService {
  async get(tx: Prisma.TransactionClient, projectId: string, id: string) {
    const task = await tx.task.findUnique({
      where: { projectId_id: { projectId, id } },
      select: taskSelect,
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    return task;
  }
  checkRevision(task: { revision: number }, expected: number) {
    if (task.revision !== expected)
      throw new ConflictException({
        code: 'TASK_REVISION_CONFLICT',
        message: 'Задача уже изменена. Загрузите актуальную версию',
      });
  }
  checkActive(
    task: { archivedAt: Date | null },
    message = 'Задача в архиве. Сначала восстановите её',
  ) {
    if (task.archivedAt) throw new ConflictException(message);
  }
  record(
    tx: Prisma.TransactionClient,
    task: { id: string; revision: number },
    actorId: string,
    kind: TaskEventKind,
    changes: Prisma.InputJsonObject,
  ) {
    return tx.taskEvent.create({
      data: {
        taskId: task.id,
        revision: task.revision,
        actorId,
        kind,
        changes,
      },
    });
  }
}
