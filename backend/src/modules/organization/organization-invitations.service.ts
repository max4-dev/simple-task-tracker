import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import { TIME } from '../../common/constants/index.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OrganizationAccessService } from './organization-access.service.js';
import { page } from './lib/organization-permissions.js';
import type {
  CreateInvitationDto,
  AcceptInvitationDto,
} from './dto/invitation.dto.js';
import type { PageQueryDto } from './dto/organization.dto.js';

const invitationSelect = {
  id: true,
  organizationId: true,
  email: true,
  roleId: true,
  roleName: true,
  invitedById: true,
  expiresAt: true,
  createdAt: true,
  acceptedAt: true,
  revokedAt: true,
} satisfies Prisma.OrganizationInvitationSelect;
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class OrganizationInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly config: ConfigService,
  ) {}

  create(organizationId: string, userId: string, dto: CreateInvitationDto) {
    return this.access.mutate(organizationId, userId, async (tx) => {
      const role = await tx.organizationRole.findUnique({
        where: { organizationId_id: { organizationId, id: dto.roleId } },
        select: { id: true, name: true },
      });
      if (!role) throw new NotFoundException('Роль не найдена');
      const member = await tx.organizationMember.findFirst({
        where: {
          organizationId,
          user: { email: { equals: dto.email, mode: 'insensitive' } },
        },
        select: { userId: true },
      });
      if (member)
        throw new ConflictException('Пользователь уже состоит в организации');
      const now = new Date();
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId,
          email: { equals: dto.email, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { lte: now },
        },
        data: { revokedAt: now },
      });
      const pending = await tx.organizationInvitation.findFirst({
        where: {
          organizationId,
          email: { equals: dto.email, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (pending)
        throw new ConflictException(
          'Активное приглашение уже существует. Отзовите его перед повторной выдачей',
        );
      const token = randomBytes(32).toString('hex');
      const invitation = await tx.organizationInvitation.create({
        data: {
          organizationId,
          email: dto.email,
          roleId: dto.roleId,
          roleName: role.name,
          invitedById: userId,
          tokenHash: digest(token),
          expiresAt: new Date(now.getTime() + 7 * TIME.ONE_DAY.IN_MS),
        },
        select: invitationSelect,
      });
      return {
        ...invitation,
        invitationUrl:
          this.config.getOrThrow<string>('PUBLIC_API_URL') +
          '/organization-invitations/accept#token=' +
          token,
      };
    });
  }

  list(organizationId: string, userId: string, query: PageQueryDto) {
    return this.access.read(organizationId, userId, async (tx) => {
      const invitations = await tx.organizationInvitation.findMany({
        where: {
          organizationId,
          ...(query.after ? { id: { gt: query.after } } : {}),
        },
        select: invitationSelect,
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      });
      return page(invitations, query.limit, (invitation) => invitation.id);
    });
  }

  revoke(organizationId: string, userId: string, invitationId: string) {
    return this.access.mutate(organizationId, userId, async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where: { id: invitationId, organizationId },
        select: invitationSelect,
      });
      if (!invitation) throw new NotFoundException('Приглашение не найдено');
      if (invitation.acceptedAt)
        throw new ConflictException('Приглашение уже принято');
      if (!invitation.revokedAt)
        await tx.organizationInvitation.update({
          where: { id: invitationId },
          data: { revokedAt: new Date() },
        });
    });
  }

  async accept(userId: string, dto: AcceptInvitationDto) {
    const tokenHash = digest(dto.token);
    const reference = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash },
      select: { organizationId: true },
    });
    if (!reference)
      throw new BadRequestException('Приглашение недействительно');
    return this.access.locked(reference.organizationId, async (tx) => {
      const invitation = await tx.organizationInvitation.findUnique({
        where: { tokenHash },
        select: invitationSelect,
      });
      if (
        !invitation ||
        !invitation.roleId ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date()
      )
        throw new BadRequestException('Приглашение недействительно');
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      if (
        user.email.trim().toLowerCase() !==
        invitation.email.trim().toLowerCase()
      )
        throw new ForbiddenException(
          'Приглашение предназначено для другого email',
        );
      const existing = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId,
          },
        },
        select: { userId: true },
      });
      if (existing)
        throw new ConflictException('Вы уже состоите в организации');
      await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId,
          roleId: invitation.roleId,
        },
      });
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date(), acceptedById: userId },
      });
      return { organizationId: invitation.organizationId };
    });
  }
}
