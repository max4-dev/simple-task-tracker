import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectController } from './project.controller.js';
import {
  ProjectStatusesController,
  ProjectTagsController,
} from './project-board.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectAccessService } from './project-access.service.js';
import { ProjectMembersService } from './project-members.service.js';
import { ProjectStatusesService } from './project-statuses.service.js';
import { ProjectTagsService } from './project-tags.service.js';

@Module({
  imports: [OrganizationModule, AuthModule],
  controllers: [
    ProjectController,
    ProjectStatusesController,
    ProjectTagsController,
  ],
  providers: [
    ProjectService,
    ProjectAccessService,
    ProjectMembersService,
    ProjectStatusesService,
    ProjectTagsService,
  ],
  exports: [ProjectAccessService],
})
export class ProjectModule {}
