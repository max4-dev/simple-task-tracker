import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { verify } from 'argon2';
import { OrganizationAccessService } from '../organization/organization-access.service.js';
import {
  page,
  requireOwner,
} from '../organization/lib/organization-permissions.js';
import { ProjectAccessService } from './project-access.service.js';
import { INITIAL_STATUSES, projectSelect } from './lib/project.constants.js';
import type {
  CreateProjectDto,
  DeleteProjectDto,
  ProjectPageQueryDto,
  UpdateProjectDto,
} from './dto/project.dto.js';

@Injectable()
export class ProjectService {
  constructor(
    private readonly organizations: OrganizationAccessService,
    private readonly access: ProjectAccessService,
  ) {}

  create(organizationId: string, userId: string, dto: CreateProjectDto) {
    return this.organizations.mutate(organizationId, userId, async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          taskPrefix: dto.taskPrefix,
        },
        select: projectSelect,
      });
      await tx.projectMember.create({
        data: { organizationId, projectId: project.id, userId },
      });
      await tx.taskStatus.createMany({
        data: INITIAL_STATUSES.map((status) => ({
          ...status,
          projectId: project.id,
        })),
      });
      return project;
    });
  }

  list(organizationId: string, userId: string, query: ProjectPageQueryDto) {
    return this.organizations.read(
      organizationId,
      userId,
      async (tx, { actor }) => {
        const projects = await tx.project.findMany({
          where: {
            organizationId,
            ...(actor.isOwner ? {} : { members: { some: { userId } } }),
            ...(query.after ? { id: { gt: query.after } } : {}),
            ...(query.state === 'all'
              ? {}
              : {
                  archivedAt: query.state === 'archived' ? { not: null } : null,
                }),
          },
          select: projectSelect,
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        });
        return page(projects, query.limit, (project) => project.id);
      },
    );
  }

  get(organizationId: string, projectId: string, userId: string) {
    return this.access.read(
      organizationId,
      projectId,
      userId,
      async (_, { project }) => project,
    );
  }

  update(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: UpdateProjectDto,
  ) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx, { project }) => {
        if (
          dto.taskPrefix !== undefined &&
          dto.taskPrefix !== project.taskPrefix &&
          project.lastTaskNumber > 0
        )
          throw new ConflictException(
            'Префикс нельзя изменить после выдачи первого номера задачи',
          );
        return tx.project.update({
          where: { id: projectId },
          data: {
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            taskPrefix: dto.taskPrefix,
          },
          select: projectSelect,
        });
      },
    );
  }

  archive(organizationId: string, projectId: string, userId: string) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx, { project }) => {
        if (project.archivedAt) return project;
        return tx.project.update({
          where: { id: projectId },
          data: { archivedAt: new Date() },
          select: projectSelect,
        });
      },
      true,
    );
  }

  restore(organizationId: string, projectId: string, userId: string) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx, { project }) => {
        if (!project.archivedAt) return project;
        return tx.project.update({
          where: { id: projectId },
          data: { archivedAt: null },
          select: projectSelect,
        });
      },
      true,
    );
  }

  delete(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: DeleteProjectDto,
  ) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx, { actor }) => {
        requireOwner(actor);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { password: true },
        });
        if (!(await verify(user.password, dto.password)))
          throw new BadRequestException('Неверный пароль');
        await tx.project.delete({ where: { id: projectId } });
      },
      true,
    );
  }
}
