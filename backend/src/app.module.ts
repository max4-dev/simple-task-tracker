import { BoardModule } from './modules/board/board.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { TaskModule } from './modules/task/task.module.js';
import { ProjectModule } from './modules/project/project.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './common/http/origin.guard.js';
import { UserModule } from './modules/user/user.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { validateConfig } from './common/config/app-config/index.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      validate: validateConfig,
    }),
    RedisModule,
    HealthModule,
    UserModule,
    OrganizationModule,
    ProjectModule,
    TaskModule,
    BoardModule,
    NotificationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
