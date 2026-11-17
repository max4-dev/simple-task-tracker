import { RedisService } from '../../common/redis/redis.service.js';
import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.getClient().ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException(
        'A required service is unavailable',
      );
    }
  }
}
