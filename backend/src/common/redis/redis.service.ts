import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { ConfigSchema } from '../config/app-config/index.js';
import { TIME } from '../constants/index.js';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService<ConfigSchema, true>) {
    this.client = new Redis({
      host: config.get('REDIS_HOST', { infer: true }),
      port: config.get('REDIS_PORT', { infer: true }),
      password: config.get('REDIS_PASSWORD', { infer: true }),
      tls: config.get('REDIS_TLS', { infer: true }) ? {} : undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: config.get('REDIS_CONNECT_TIMEOUT_MS', { infer: true }),
      commandTimeout: config.get('REDIS_COMMAND_TIMEOUT_MS', { infer: true }),
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 50, 2 * TIME.ONE_SECOND.IN_MS),
    });
    this.client.on('error', () => this.logger.error('Redis connection error'));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.client.ping();
      this.logger.log('Redis connected');
    } catch {
      this.client.disconnect();
      throw new Error(
        'Redis connection failed; check connectivity and credentials',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      if (this.client.status === 'ready') await this.client.quit();
    } finally {
      this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }
}
