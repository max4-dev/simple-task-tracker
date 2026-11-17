import { RedisModule } from '../../common/redis/redis.module.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
