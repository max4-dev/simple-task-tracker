import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';
import { NotificationWorker } from './notification.worker.js';
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationWorker],
})
export class NotificationModule {}
