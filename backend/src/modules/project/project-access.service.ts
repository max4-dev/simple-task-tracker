import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  OrganizationAccessService,
  type OrganizationContext,
} from '../organization/organization-access.service.js';
import { projectSelect } from './lib/project.constants.js';

export type ProjectContext = Awaited<
  ReturnType<ProjectAccessService['context']>
>;

@Injectable()
export class ProjectAccessService {
  constructor(private readonly organizations: OrganizationAccessService) {}

  async context(
    tx: Prisma.TransactionClient,
    organization: OrganizationContext,
    projectId: string,
  ) {
    const project = await tx.project.findUnique({
      where: {
        organizationId_id: {
          organizationId: organization.organization.id,
          id: projectId,
        },
      },
      select: projectSelect,
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (!organization.actor.isOwner) {
      const member = await tx.projectMember.findUnique({
        where: {
          projectId_userId: { projectId, userId: organization.actor.userId },
        },
        select: { userId: true },
      });
      if (!member) throw new NotFoundException('Проект не найден');
    }
    return { ...organization, project };
  }

  read<T>(
    organizationId: string,
    projectId: string,
    userId: string,
    operation: (
      tx: Prisma.TransactionClient,
      context: ProjectContext,
    ) => Promise<T>,
  ) {
    return this.organizations.read(
      organizationId,
      userId,
      async (tx, organization) =>
        operation(tx, await this.context(tx, organization, projectId)),
    );
  }

  mutate<T>(
    organizationId: string,
    projectId: string,
    userId: string,
    operation: (
      tx: Prisma.TransactionClient,
      context: ProjectContext,
    ) => Promise<T>,
    allowArchived = false,
  ) {
    return this.organizations.mutate(
      organizationId,
      userId,
      async (tx, organization) => {
        // All project writers use the same organization -> project lock order.
        await tx.$queryRaw`SELECT "id" FROM "app"."Project" WHERE "organizationId" = ${organizationId} AND "id" = ${projectId} FOR UPDATE`;
        const context = await this.context(tx, organization, projectId);
        if (context.project.archivedAt && !allowArchived)
          throw new ConflictException(
            'Проект в архиве. Сначала восстановите его',
          );
        return operation(tx, context);
      },
      'shared',
    );
  }
}
