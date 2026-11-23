import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { TIME } from '../../common/constants/time.constants.js';
import type { NotificationQueryDto } from './dto/notification.dto.js';

export function notificationCursor(
  raw: string | undefined,
  user: string,
  state: string,
) {
  if (raw === undefined) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString()) as {
      user: string;
      state: string;
      id: string;
      at: string;
    };
    if (
      raw.length > 512 ||
      v.user !== user ||
      v.state !== state ||
      !isUUID(v.id, '4') ||
      typeof v.at !== 'string' ||
      new Date(v.at).toISOString() !== v.at
    )
      throw new Error();
    return v;
  } catch {
    throw new BadRequestException('Некорректный курсор уведомлений');
  }
}
export const notificationCutoff = () =>
  new Date(Date.now() - 90 * TIME.ONE_DAY.IN_MS);
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}
  list(user: string, query: NotificationQueryDto) {
    const cursor = notificationCursor(query.after, user, query.state);
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.notification.findMany({
          where: {
            recipientId: user,
            createdAt: { gt: notificationCutoff() },
            ...(query.state === 'unread' ? { readAt: null } : {}),
            ...(cursor
              ? {
                  OR: [
                    { createdAt: { lt: new Date(cursor.at) } },
                    { createdAt: new Date(cursor.at), id: { lt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
        });
        const visible = rows.slice(0, query.limit);
        const tasks = await tx.task.findMany({
          where: {
            id: { in: visible.flatMap((n) => (n.taskId ? [n.taskId] : [])) },
            project: {
              organization: { members: { some: { userId: user } } },
              OR: [
                { members: { some: { userId: user } } },
                { organization: { ownerUserId: user } },
              ],
            },
          },
          select: {
            id: true,
            projectId: true,
            project: { select: { organizationId: true } },
          },
        });
        const allowed = new Map(
          tasks.map((t) => [
            t.id,
            {
              organizationId: t.project.organizationId,
              projectId: t.projectId,
              taskId: t.id,
            },
          ]),
        );
        const items = visible.map((n) => {
          const target = n.taskId ? (allowed.get(n.taskId) ?? null) : null;
          return {
            id: n.id,
            kind: n.kind,
            title: target ? n.title : 'Задача недоступна',
            body: target ? n.body : '',
            actorId: target ? n.actorId : null,
            createdAt: n.createdAt,
            readAt: n.readAt,
            available: !!target,
            target,
          };
        });
        const last = visible.at(-1);
        return {
          items,
          nextCursor:
            rows.length > query.limit && last
              ? Buffer.from(
                  JSON.stringify({
                    user,
                    state: query.state,
                    id: last.id,
                    at: last.createdAt.toISOString(),
                  }),
                ).toString('base64url')
              : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async unread(user: string) {
    return {
      count: await this.prisma.notification.count({
        where: {
          recipientId: user,
          readAt: null,
          createdAt: { gt: notificationCutoff() },
        },
      }),
    };
  }
  async read(user: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const where = {
        id,
        recipientId: user,
        createdAt: { gt: notificationCutoff() },
      };
      await tx.notification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      });
      const row = await tx.notification.findFirst({
        where,
        select: { id: true, readAt: true },
      });
      if (!row) throw new NotFoundException('Уведомление не найдено');
      return row;
    });
  }
  async readAll(user: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: user,
        readAt: null,
        createdAt: { gt: notificationCutoff() },
      },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }
}
