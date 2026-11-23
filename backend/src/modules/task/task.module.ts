import { TaskMutationService } from './task-mutation.service.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskController } from './task.controller.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [AuthModule, ProjectModule],
  controllers: [TaskController],
  providers: [TaskService, TaskMutationService],
  exports: [TaskMutationService],
})
export class TaskModule {}
