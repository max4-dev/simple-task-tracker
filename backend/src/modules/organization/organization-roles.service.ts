import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  OrganizationAccessService,
  roleSelect,
} from './organization-access.service.js';
import { OWNER_ROLE, page } from './lib/organization-permissions.js';
import type {
  CreateOrganizationRoleDto,
  UpdateOrganizationRoleDto,
  PageQueryDto,
} from './dto/organization.dto.js';

@Injectable()
export class OrganizationRolesService {
  constructor(private readonly access: OrganizationAccessService) {}

  list(organizationId: string, userId: string, query: PageQueryDto) {
    return this.access.read(organizationId, userId, async (tx) => {
      const roles = await tx.organizationRole.findMany({
        where: {
          organizationId,
          ...(query.after ? { id: { gt: query.after } } : {}),
        },
        select: roleSelect,
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return {
        systemRole: OWNER_ROLE,
        ...page(
          roles.map((role) => ({ ...role, isSystem: false })),
          query.limit,
          (role) => role.id,
        ),
      };
    });
  }

  private async validateName(
    tx: Prisma.TransactionClient,
    organizationId: string,
    name: string,
    excludeId?: string,
  ) {
    if (name.trim().toLowerCase() === 'owner')
      throw new BadRequestException('Название owner зарезервировано');
    const duplicate = await tx.organizationRole.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException('Роль с таким названием уже существует');
  }

  create(
    organizationId: string,
    userId: string,
    dto: CreateOrganizationRoleDto,
  ) {
    return this.access.mutate(organizationId, userId, async (tx) => {
      await this.validateName(tx, organizationId, dto.name);
      const role = await tx.organizationRole.create({
        data: { organizationId, name: dto.name, description: dto.description },
        select: roleSelect,
      });
      return { ...role, isSystem: false };
    });
  }

  update(
    organizationId: string,
    userId: string,
    roleId: string,
    dto: UpdateOrganizationRoleDto,
  ) {
    return this.access.mutate(organizationId, userId, async (tx) => {
      const role = await tx.organizationRole.findUnique({
        where: { organizationId_id: { organizationId, id: roleId } },
        select: { id: true },
      });
      if (!role) throw new NotFoundException('Роль не найдена');
      if (dto.name !== undefined)
        await this.validateName(tx, organizationId, dto.name, roleId);
      const updated = await tx.organizationRole.update({
        where: { organizationId_id: { organizationId, id: roleId } },
        data: { name: dto.name, description: dto.description },
        select: roleSelect,
      });
      return { ...updated, isSystem: false };
    });
  }

  delete(organizationId: string, userId: string, roleId: string) {
    return this.access.mutate(organizationId, userId, async (tx) => {
      const role = await tx.organizationRole.findUnique({
        where: { organizationId_id: { organizationId, id: roleId } },
        select: {
          id: true,
          _count: {
            select: {
              members: true,
              projectMembers: true,
              projectOverrides: true,
            },
          },
        },
      });
      if (!role) throw new NotFoundException('Роль не найдена');
      if (Object.values(role._count).some((count) => count > 0))
        throw new ConflictException(
          'Роль используется участниками, проектами или приглашениями',
        );
      const now = new Date();
      if (
        await tx.organizationInvitation.count({
          where: {
            organizationId,
            roleId,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
        })
      )
        throw new ConflictException(
          'Роль используется активными приглашениями',
        );
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId,
          roleId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { lte: now },
        },
        data: { revokedAt: now },
      });
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId,
          roleId,
          OR: [{ acceptedAt: { not: null } }, { revokedAt: { not: null } }],
        },
        data: { roleId: null },
      });
      await tx.organizationRole.delete({
        where: { organizationId_id: { organizationId, id: roleId } },
      });
    });
  }
}
