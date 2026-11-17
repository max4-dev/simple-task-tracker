import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectAccessService } from './project-access.service.js';
import type {
  CreateProjectStatusDto,
  DeleteProjectStatusDto,
  UpdateProjectStatusDto,
} from './dto/project-board.dto.js';

@Injectable()
export class ProjectStatusesService {
  constructor(private readonly access: ProjectAccessService) {}

  list(organizationId: string, projectId: string, userId: string) {
    return this.access.read(organizationId, projectId, userId, (tx) =>
      tx.taskStatus.findMany({
        where: { projectId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
    );
  }

  create(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: CreateProjectStatusDto,
  ) {
    return this.access.mutate(organizationId, projectId, userId, async (tx) => {
      const last = await tx.taskStatus.aggregate({
        where: { projectId },
        _max: { position: true },
      });
      const position = dto.position ?? (last._max.position ?? -1) + 1;
      if (position > 1000000)
        throw new ConflictException(
          'Сначала уменьшите позиции существующих статусов',
        );
      return tx.taskStatus.create({
        data: {
          projectId,
          name: dto.name,
          color: dto.color,
          category: dto.category,
          position,
        },
      });
    });
  }

  update(
    organizationId: string,
    projectId: string,
    userId: string,
    statusId: string,
    dto: UpdateProjectStatusDto,
  ) {
    return this.access.mutate(organizationId, projectId, userId, async (tx) => {
      const existing = await tx.taskStatus.findUnique({
        where: { projectId_id: { projectId, id: statusId } },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Статус не найден');
      return tx.taskStatus.update({
        where: { projectId_id: { projectId, id: statusId } },
        data: {
          name: dto.name,
          category: dto.category,
          color: dto.color,
          position: dto.position,
        },
      });
    });
  }

  delete(
    organizationId: string,
    projectId: string,
    userId: string,
    statusId: string,
    dto: DeleteProjectStatusDto,
  ) {
    return this.access.mutate(organizationId, projectId, userId, async (tx) => {
      const status = await tx.taskStatus.findUnique({
        where: { projectId_id: { projectId, id: statusId } },
        select: { id: true },
      });
      if (!status) throw new NotFoundException('Статус не найден');
      if (dto.replacementStatusId === statusId)
        throw new BadRequestException('Выберите другой статус для задач');
      if ((await tx.taskStatus.count({ where: { projectId } })) <= 1)
        throw new ConflictException(
          'В проекте должен оставаться хотя бы один статус',
        );
      if (dto.replacementStatusId) {
        const replacement = await tx.taskStatus.findUnique({
          where: { projectId_id: { projectId, id: dto.replacementStatusId } },
          select: { id: true },
        });
        if (!replacement)
          throw new NotFoundException('Статус для переноса не найден');
      }
      const count = await tx.task.count({ where: { projectId, statusId } });
      if (count && !dto.replacementStatusId)
        throw new ConflictException(
          'Укажите статус, в который перенести задачи',
        );
      if (count)
        await tx.task.updateMany({
          where: { projectId, statusId },
          data: { statusId: dto.replacementStatusId },
        });
      await tx.taskStatus.delete({
        where: { projectId_id: { projectId, id: statusId } },
      });
    });
  }
}
