import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { roleSelect } from '../organization/organization-access.service.js';
import {
  OWNER_ROLE,
  page,
} from '../organization/lib/organization-permissions.js';
import type { PageQueryDto } from '../organization/dto/organization.dto.js';
import { ProjectAccessService } from './project-access.service.js';
import type {
  AddProjectMemberDto,
  UpdateProjectMemberRoleDto,
} from './dto/project.dto.js';

const memberSelect = {
  userId: true,
  joinedAt: true,
  roleId: true,
  role: { select: roleSelect },
  member: {
    select: {
      role: { select: roleSelect },
      user: { select: { name: true, email: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.ProjectMemberSelect;
type Member = Prisma.ProjectMemberGetPayload<{ select: typeof memberSelect }>;

export function presentProjectMember(member: Member, ownerUserId: string) {
  const isOwner = member.userId === ownerUserId;
  const role = member.role ?? member.member.role;
  return {
    userId: member.userId,
    joinedAt: member.joinedAt,
    ...member.member.user,
    projectRoleId: member.roleId,
    role: isOwner ? OWNER_ROLE : role ? { ...role, isSystem: false } : null,
    roleSource: isOwner
      ? 'owner'
      : member.role
        ? 'project'
        : member.member.role
          ? 'organization'
          : 'none',
  };
}

@Injectable()
export class ProjectMembersService {
  constructor(private readonly access: ProjectAccessService) {}

  private async checkRole(
    tx: Prisma.TransactionClient,
    organizationId: string,
    roleId: string | null | undefined,
    userId: string,
    ownerUserId: string,
  ) {
    if (!roleId) return;
    if (userId === ownerUserId)
      throw new BadRequestException('Системную роль owner нельзя изменить');
    const role = await tx.organizationRole.findUnique({
      where: { organizationId_id: { organizationId, id: roleId } },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Роль не найдена');
  }

  list(
    organizationId: string,
    projectId: string,
    userId: string,
    query: PageQueryDto,
  ) {
    return this.access.read(
      organizationId,
      projectId,
      userId,
      async (tx, { organization }) => {
        const members = await tx.projectMember.findMany({
          where: {
            projectId,
            ...(query.after ? { userId: { gt: query.after } } : {}),
          },
          select: memberSelect,
          orderBy: { userId: 'asc' },
          take: query.limit + 1,
        });
        return page(
          members.map((member) =>
            presentProjectMember(member, organization.ownerUserId),
          ),
          query.limit,
          (member) => member.userId,
        );
      },
    );
  }

  add(
    organizationId: string,
    projectId: string,
    userId: string,
    dto: AddProjectMemberDto,
  ) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx, { organization }) => {
        const member = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId, userId: dto.userId },
          },
          select: { userId: true },
        });
        if (!member)
          throw new NotFoundException('Участник организации не найден');
        await this.checkRole(
          tx,
          organizationId,
          dto.roleId,
          dto.userId,
          organization.ownerUserId,
        );
        const existing = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: dto.userId } },
          select: { userId: true },
        });
        if (existing)
          throw new ConflictException('Участник уже добавлен в проект');
        const created = await tx.projectMember.create({
          data: {
            organizationId,
            projectId,
            userId: dto.userId,
            roleId: dto.roleId ?? null,
          },
          select: memberSelect,
        });
        return presentProjectMember(created, organization.ownerUserId);
      },
    );
  }

  updateRole(
    organizationId: string,
    projectId: string,
    userId: string,
    targetId: string,
    dto: UpdateProjectMemberRoleDto,
  ) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx, { organization }) => {
        const member = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: targetId } },
          select: { userId: true },
        });
        if (!member) throw new NotFoundException('Участник проекта не найден');
        await this.checkRole(
          tx,
          organizationId,
          dto.roleId,
          targetId,
          organization.ownerUserId,
        );
        const updated = await tx.projectMember.update({
          where: { projectId_userId: { projectId, userId: targetId } },
          data: { roleId: dto.roleId },
          select: memberSelect,
        });
        return presentProjectMember(updated, organization.ownerUserId);
      },
    );
  }

  remove(
    organizationId: string,
    projectId: string,
    userId: string,
    targetId: string,
  ) {
    return this.access.mutate(organizationId, projectId, userId, async (tx) => {
      const member = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: targetId } },
        select: { userId: true },
      });
      if (!member) throw new NotFoundException('Участник проекта не найден');
      await tx.projectMember.delete({
        where: { projectId_userId: { projectId, userId: targetId } },
      });
    });
  }

  leave(organizationId: string, projectId: string, userId: string) {
    return this.access.mutate(
      organizationId,
      projectId,
      userId,
      async (tx) => {
        // An owner can drop explicit participation; implicit owner access remains.
        await tx.projectMember.deleteMany({ where: { projectId, userId } });
      },
      true,
    );
  }
}
