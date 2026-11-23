import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service.js';
import { TIME } from '../../common/constants/time.constants.js';

@Injectable()
export class NotificationWorker
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(NotificationWorker.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (
      this.config.get('NODE_ENV') !== 'test' &&
      this.config.get('NOTIFICATION_WORKER_ENABLED')
    )
      this.schedule();
  }
  private schedule() {
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .catch(() => this.logger.error('Notification processing unavailable'))
        .finally(() => {
          if (!this.stopped) this.schedule();
        });
    }, 5 * TIME.ONE_SECOND.IN_MS);
    this.timer.unref();
  }
  async beforeApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  // One transaction, SKIP LOCKED across replicas. A crash rolls back both delivery and acknowledgement.
  async tick() {
    await this.prisma.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "app"."NotificationJob" WHERE "processedAt" IS NULL AND "availableAt" <= now() ORDER BY "availableAt", id LIMIT 25 FOR UPDATE SKIP LOCKED`;
      for (const { id } of jobs) {
        await tx.$executeRawUnsafe('SAVEPOINT delivery');
        try {
          await tx.$executeRaw`
            INSERT INTO "app"."Notification" (id,"sourceKey","recipientId","actorId","taskId",kind,title,body,"createdAt")
            SELECT gen_random_uuid()::text,j."sourceKey",j."recipientId",u.id,j."taskId",j.kind,j.title,j.body,j."createdAt"
            FROM "app"."NotificationJob" j
            JOIN "app"."Task" t ON t.id=j."taskId"
            JOIN "app"."Project" p ON p.id=t."projectId"
            JOIN "app"."OrganizationMember" om ON om."organizationId"=p."organizationId" AND om."userId"=j."recipientId"
            JOIN "app"."ProjectMember" pm ON pm."projectId"=p.id AND pm."userId"=j."recipientId"
            LEFT JOIN "app"."User" u ON u.id=j."actorId"
            WHERE j.id=${id} AND j."createdAt" > now() - interval '90 days'
            ON CONFLICT ("sourceKey") DO NOTHING`;
          await tx.notificationJob.update({
            where: { id },
            data: { processedAt: new Date(), lastError: null },
          });
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT delivery');
        } catch {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT delivery');
          await tx.$executeRaw`UPDATE "app"."NotificationJob" SET attempts=LEAST(attempts+1,1000000), "lastError"='DELIVERY_FAILED', "availableAt"=now() + make_interval(secs => LEAST(3600, 5 * power(2, LEAST(attempts, 10)))::integer) WHERE id=${id}`;
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT delivery');
          this.logger.warn('Notification delivery scheduled for retry');
        }
      }
      // Bounded cleanup avoids long transactions on a large inbox/outbox.
      await tx.$executeRaw`DELETE FROM "app"."Notification" WHERE id IN (SELECT id FROM "app"."Notification" WHERE "createdAt" < now() - interval '90 days' ORDER BY "createdAt" LIMIT 200 FOR UPDATE SKIP LOCKED)`;
      await tx.$executeRaw`DELETE FROM "app"."NotificationJob" WHERE id IN (SELECT id FROM "app"."NotificationJob" WHERE "createdAt" < now() - interval '90 days' ORDER BY "createdAt" LIMIT 200 FOR UPDATE SKIP LOCKED)`;
    });
  }
}
