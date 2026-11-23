import { removeMemberTaskAssignments } from '../../common/database/task-history.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { verify } from 'argon2';
import { PrismaService } from '../../common/database/prisma.service.js';
import {
  OrganizationAccessService,
  organizationSelect,
  roleSelect,
} from './organization-access.service.js';
import {
  OWNER_ROLE,
  page,
  requireOwner,
} from './lib/organization-permissions.js';
import type {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  PageQueryDto,
  TransferOwnershipDto,
  DeleteOrganizationDto,
} from './dto/organization.dto.js';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: dto.name, slug: dto.slug, ownerUserId: userId },
          select: organizationSelect,
        });
        await tx.organizationMember.create({
          data: { organizationId: organization.id, userId },
        });
        await tx.organizationRole.create({
          data: { organizationId: organization.id, name: 'Member' },
        });
        return { ...organization, myRole: OWNER_ROLE };
      });
    } catch (error) {
      this.access.rethrow(error);
    }
  }

  async list(userId: string, query: PageQueryDto) {
    const rows = await this.prisma.organization.findMany({
      where: {
        members: { some: { userId } },
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      select: {
        ...organizationSelect,
        members: {
          where: { userId },
          select: { role: { select: roleSelect } },
        },
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    return page(
      rows.map(({ members, ...organization }) => ({
        ...organization,
        myRole:
          organization.ownerUserId === userId
            ? OWNER_ROLE
            : members[0]?.role
              ? { ...members[0].role, isSystem: false }
              : null,
      })),
      query.limit,
      (row) => row.id,
    );
  }

  get(organizationId: string, userId: string) {
    return this.access.read(
      organizationId,
      userId,
      async (_, { actor, organization }) => ({
        ...organization,
        myRole: actor.isOwner
          ? OWNER_ROLE
          : actor.role
            ? { ...actor.role, isSystem: false }
            : null,
      }),
    );
  }

  update(organizationId: string, userId: string, dto: UpdateOrganizationDto) {
    return this.access.mutate(organizationId, userId, async (tx, { actor }) => {
      const organization = await tx.organization.update({
        where: { id: organizationId },
        data: { name: dto.name, slug: dto.slug },
        select: organizationSelect,
      });
      return {
        ...organization,
        myRole: actor.isOwner
          ? OWNER_ROLE
          : actor.role
            ? { ...actor.role, isSystem: false }
            : null,
      };
    });
  }

  transferOwnership(
    organizationId: string,
    userId: string,
    dto: TransferOwnershipDto,
  ) {
    return this.access.mutate(organizationId, userId, async (tx, { actor }) => {
      requireOwner(actor);
      if (dto.userId === userId)
        throw new BadRequestException('Участник уже является owner');
      const target = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: dto.userId },
        },
        select: { userId: true },
      });
      if (!target) throw new NotFoundException('Участник не найден');
      const organization = await tx.organization.update({
        where: { id: organizationId },
        data: { ownerUserId: dto.userId },
        select: organizationSelect,
      });
      return {
        ...organization,
        myRole: actor.role ? { ...actor.role, isSystem: false } : null,
      };
    });
  }

  leave(organizationId: string, userId: string) {
    return this.access.mutate(organizationId, userId, async (tx, { actor }) => {
      if (actor.isOwner)
        throw new BadRequestException(
          'Перед выходом передайте владение организацией',
        );
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId,
          acceptedAt: null,
          revokedAt: null,
          OR: [
            { invitedById: userId },
            { email: { equals: user.email, mode: 'insensitive' } },
          ],
        },
        data: { revokedAt: new Date() },
      });
      await removeMemberTaskAssignments(tx, organizationId, userId, userId);
      await tx.organizationMember.delete({
        where: { organizationId_userId: { organizationId, userId } },
      });
    });
  }

  delete(organizationId: string, userId: string, dto: DeleteOrganizationDto) {
    return this.access.mutate(organizationId, userId, async (tx, { actor }) => {
      requireOwner(actor);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { password: true },
      });
      if (!(await verify(user.password, dto.password)))
        throw new BadRequestException('Неверный пароль');
      await tx.organization.delete({ where: { id: organizationId } });
    });
  }
}
