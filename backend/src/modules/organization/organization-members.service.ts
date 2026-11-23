import { removeMemberTaskAssignments } from '../../common/database/task-history.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationAccessService,
  roleSelect,
} from './organization-access.service.js';
import { OWNER_ROLE, page } from './lib/organization-permissions.js';
import type {
  AssignOrganizationRoleDto,
  PageQueryDto,
} from './dto/organization.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';

const memberSelect = {
  userId: true,
  joinedAt: true,
  user: { select: { name: true, email: true, avatarUrl: true } },
  role: { select: roleSelect },
} satisfies Prisma.OrganizationMemberSelect;
type Member = Prisma.OrganizationMemberGetPayload<{
  select: typeof memberSelect;
}>;
const present = ({ user, role, ...member }: Member, ownerUserId: string) => ({
  ...member,
  ...user,
  role:
    member.userId === ownerUserId
      ? OWNER_ROLE
      : role
        ? { ...role, isSystem: false }
        : null,
});

@Injectable()
export class OrganizationMembersService {
  constructor(private readonly access: OrganizationAccessService) {}

  list(organizationId: string, userId: string, query: PageQueryDto) {
    return this.access.read(
      organizationId,
      userId,
      async (tx, { organization }) => {
        const members = await tx.organizationMember.findMany({
          where: {
            organizationId,
            ...(query.after ? { userId: { gt: query.after } } : {}),
          },
          select: memberSelect,
          orderBy: { userId: 'asc' },
          take: query.limit + 1,
        });
        return page(
          members.map((member) => present(member, organization.ownerUserId)),
          query.limit,
          (member) => member.userId,
        );
      },
    );
  }

  assignRole(
    organizationId: string,
    userId: string,
    targetUserId: string,
    dto: AssignOrganizationRoleDto,
  ) {
    return this.access.mutate(
      organizationId,
      userId,
      async (tx, { organization }) => {
        if (targetUserId === organization.ownerUserId)
          throw new BadRequestException('Роль owner нельзя изменить');
        const target = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId, userId: targetUserId },
          },
          select: { userId: true },
        });
        if (!target) throw new NotFoundException('Участник не найден');
        if (dto.roleId !== null) {
          const role = await tx.organizationRole.findUnique({
            where: { organizationId_id: { organizationId, id: dto.roleId } },
            select: { id: true },
          });
          if (!role) throw new NotFoundException('Роль не найдена');
        }
        const member = await tx.organizationMember.update({
          where: {
            organizationId_userId: { organizationId, userId: targetUserId },
          },
          data: { roleId: dto.roleId },
          select: memberSelect,
        });
        return present(member, organization.ownerUserId);
      },
    );
  }

  remove(organizationId: string, userId: string, targetUserId: string) {
    return this.access.mutate(
      organizationId,
      userId,
      async (tx, { organization }) => {
        if (targetUserId === organization.ownerUserId)
          throw new BadRequestException('Нельзя исключить owner');
        const target = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId, userId: targetUserId },
          },
          select: { user: { select: { email: true } } },
        });
        if (!target) throw new NotFoundException('Участник не найден');
        await tx.organizationInvitation.updateMany({
          where: {
            organizationId,
            acceptedAt: null,
            revokedAt: null,
            OR: [
              { invitedById: targetUserId },
              { email: { equals: target.user.email, mode: 'insensitive' } },
            ],
          },
          data: { revokedAt: new Date() },
        });
        await removeMemberTaskAssignments(
          tx,
          organizationId,
          targetUserId,
          userId,
        );
        await tx.organizationMember.delete({
          where: {
            organizationId_userId: { organizationId, userId: targetUserId },
          },
        });
      },
    );
  }
}
