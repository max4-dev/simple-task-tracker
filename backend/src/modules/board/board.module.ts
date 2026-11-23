import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskModule } from '../task/task.module.js';
import { BoardController } from './board.controller.js';
import { BoardService } from './board.service.js';

@Module({
  imports: [AuthModule, ProjectModule, TaskModule],
  controllers: [BoardController],
  providers: [BoardService],
})
export class BoardModule {}
