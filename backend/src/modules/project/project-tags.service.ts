import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectAccessService } from './project-access.service.js';
import { page } from '../organization/lib/organization-permissions.js';
import type { PageQueryDto } from '../organization/dto/organization.dto.js';
import type {
  CreateProjectTagDto,
  UpdateProjectTagDto,
} from './dto/project-board.dto.js';

@Injectable()
export class ProjectTagsService {
  constructor(private readonly access: ProjectAccessService) {}

  list(
    organizationId: string,
    projectId: string,
    userId: string,
    query: PageQueryDto,
  ) {
    return this.access.read(organizationId, projectId, userId, async (tx) => {
      const tags = await tx.taskTag.findMany({
        where: {
          projectId,
          ...(query.after ? { id: { gt: query.after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return page(tags, query.limit, (tag) => tag.id);
    });
  }

  create(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: CreateProjectTagDto,
  ) {
    return this.access.mutate(organizationId, projectId, userId, (tx) =>
      tx.taskTag.create({
        data: {
          projectId,
          name: dto.name,
          branchPrefix: dto.branchPrefix,
          color: dto.color,
        },
      }),
    );
  }

  update(
    organizationId: string,
    projectId: string,
    userId: string,
    tagId: string,
    dto: UpdateProjectTagDto,
  ) {
    return this.access.mutate(organizationId, projectId, userId, async (tx) => {
      const tag = await tx.taskTag.findUnique({
        where: { projectId_id: { projectId, id: tagId } },
        select: { id: true },
      });
      if (!tag) throw new NotFoundException('Тег не найден');
      return tx.taskTag.update({
        where: { projectId_id: { projectId, id: tagId } },
        data: {
          name: dto.name,
          branchPrefix: dto.branchPrefix,
          color: dto.color,
        },
      });
    });
  }

  delete(
    organizationId: string,
    projectId: string,
    userId: string,
    tagId: string,
  ) {
    return this.access.mutate(organizationId, projectId, userId, async (tx) => {
      const tag = await tx.taskTag.findUnique({
        where: { projectId_id: { projectId, id: tagId } },
        select: { id: true },
      });
      if (!tag) throw new NotFoundException('Тег не найден');
      if (await tx.task.count({ where: { projectId, tagId } }))
        throw new ConflictException('Сначала снимите тег с задач');
      await tx.taskTag.delete({
        where: { projectId_id: { projectId, id: tagId } },
      });
    });
  }
}
