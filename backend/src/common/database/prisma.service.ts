import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { ConfigSchema } from '../config/app-config/index.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<ConfigSchema, true>) {
    const adapter = new PrismaPg(
      {
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DATABASE_POOL_SIZE', { infer: true }),
        connectionTimeoutMillis: config.get('DATABASE_CONNECTION_TIMEOUT_MS', {
          infer: true,
        }),
        idleTimeoutMillis: config.get('DATABASE_IDLE_TIMEOUT_MS', {
          infer: true,
        }),
        statement_timeout: config.get('DATABASE_QUERY_TIMEOUT_MS', {
          infer: true,
        }),
        query_timeout: config.get('DATABASE_QUERY_TIMEOUT_MS', { infer: true }),
        application_name: 'task-tracker-api',
      },
      { schema: 'app' },
    );

    super({ adapter, errorFormat: 'minimal' });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
    } catch {
      await this.$disconnect();
      throw new Error(
        'Database connection failed; check connectivity and credentials',
      );
    }
    this.logger.log('Database connected');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
