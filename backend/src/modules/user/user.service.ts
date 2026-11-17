import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { hash, verify } from 'argon2';
import { PrismaService } from '../../common/database/prisma.service.js';
import { TokenService } from '../../common/redis/token.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { UserPasswordDto, UserProfileDto } from './dto/user.dto.js';
import { isWorkingNow, validateWorkIntervals } from './lib/work-schedule.js';
import { canViewProject } from './lib/project-visibility.js';

const profileSelect = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  avatarUrl: true,
  phone: true,
  bio: true,
  githubUrl: true,
  timeZone: true,
  socialLinks: {
    select: { label: true, url: true },
    orderBy: { position: 'asc' },
  },
  workIntervals: {
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  },
} satisfies Prisma.UserSelect;
type Profile = Prisma.UserGetPayload<{ select: typeof profileSelect }>;
const present = (user: Profile) => ({
  ...user,
  isWorkingNow: isWorkingNow(user.timeZone, user.workIntervals),
});

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: profileSelect,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return present(user);
  }

  async getColleagueProfile(viewerId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const organizations = await tx.organization.findMany({
          where: {
            AND: [
              { members: { some: { userId: viewerId } } },
              { members: { some: { userId: id } } },
            ],
          },
          select: { id: true, name: true, slug: true },
          orderBy: { id: 'asc' },
        });
        // Project membership requires organization membership by the database FK.
        // Missing and inaccessible profiles have the same response to prevent enumeration.
        if (viewerId !== id && !organizations.length)
          throw new NotFoundException('Пользователь не найден');
        const user = await tx.user.findUnique({
          where: { id },
          select: profileSelect,
        });
        if (!user) throw new NotFoundException('Пользователь не найден');
        const projects = await tx.project.findMany({
          where: {
            organizationId: { in: organizations.map((item) => item.id) },
            archivedAt: null,
            AND: [viewerId, id].map((userId) => ({
              OR: [
                { organization: { ownerUserId: userId } },
                { members: { some: { userId } } },
              ],
            })),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            organizationId: true,
            taskPrefix: true,
            organization: { select: { ownerUserId: true } },
            members: {
              where: { userId: { in: [viewerId, id] } },
              select: { userId: true },
            },
          },
          orderBy: { id: 'asc' },
        });
        const { emailVerifiedAt, ...publicProfile } = present(user);
        return {
          ...publicProfile,
          ...(viewerId === id ? { emailVerifiedAt } : {}),
          sharedOrganizations: organizations,
          sharedProjects: projects
            .filter((project) =>
              [viewerId, id].every((userId) =>
                canViewProject(
                  userId,
                  project.organization.ownerUserId,
                  project.members,
                ),
              ),
            )
            .map(({ id, name, slug, organizationId, taskPrefix }) => ({
              id,
              name,
              slug,
              organizationId,
              taskPrefix,
            })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async updateProfile(id: string, dto: UserProfileDto) {
    if (dto.workIntervals !== undefined)
      validateWorkIntervals(dto.workIntervals);
    const {
      socialLinks,
      workIntervals,
      name,
      avatarUrl,
      phone,
      bio,
      githubUrl,
      timeZone,
    } = dto;
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          name,
          avatarUrl,
          phone,
          bio,
          githubUrl,
          timeZone,
          socialLinks:
            socialLinks === undefined
              ? undefined
              : {
                  deleteMany: {},
                  create: socialLinks.map(({ label, url }, position) => ({
                    label,
                    url,
                    position,
                  })),
                },
          workIntervals:
            workIntervals === undefined
              ? undefined
              : { deleteMany: {}, create: workIntervals },
        },
        select: profileSelect,
      });
      return present(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025')
          throw new NotFoundException('Пользователь не найден');
        if (error.code === 'P2002')
          throw new ConflictException('Ссылки или интервалы повторяются');
      }
      throw error;
    }
  }

  async updatePassword(id: string, dto: UserPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { password: true, tokenVersion: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (!(await verify(user.password, dto.password)))
      throw new BadRequestException('Неверный пароль');
    if (dto.password === dto.newPassword)
      throw new BadRequestException(
        'Новый пароль должен отличаться от текущего',
      );
    const result = await this.prisma.user.updateMany({
      where: { id, tokenVersion: user.tokenVersion, password: user.password },
      data: {
        password: await hash(dto.newPassword),
        tokenVersion: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new ConflictException('Пароль уже изменён. Войдите повторно');
    // The DB version invalidates both JWTs even if Redis is temporarily unavailable.
    try {
      await this.tokenService.removeAllUserTokens(id);
    } catch {
      // Credentials already changed. Do not report a failed password change;
      // stale Redis hashes expire by TTL and cannot bypass the DB version check.
      this.logger.warn(
        'Password changed; stale session cleanup deferred to TTL',
      );
    }
    return { message: 'Пароль обновлён. Войдите повторно' };
  }
}
