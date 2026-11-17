import { OrganizationInvitationsService } from './organization-invitations.service.js';
import {
  OrganizationInvitationsController,
  AcceptOrganizationInvitationController,
} from './organization-invitations.controller.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationAccessService } from './organization-access.service.js';
import { OrganizationMembersService } from './organization-members.service.js';
import { OrganizationRolesService } from './organization-roles.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    OrganizationController,
    OrganizationInvitationsController,
    AcceptOrganizationInvitationController,
  ],
  providers: [
    OrganizationInvitationsService,
    OrganizationService,
    OrganizationAccessService,
    OrganizationMembersService,
    OrganizationRolesService,
  ],
  exports: [OrganizationAccessService],
})
export class OrganizationModule {}
