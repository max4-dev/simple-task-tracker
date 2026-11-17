import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TIME } from '../../common/constants/index.js';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { PageQueryDto } from '../organization/dto/organization.dto.js';
import { ProjectService } from './project.service.js';
import { ProjectMembersService } from './project-members.service.js';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  DeleteProjectDto,
  ProjectDto,
  ProjectMemberDto,
  ProjectMemberPageDto,
  ProjectPageDto,
  ProjectPageQueryDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
} from './dto/project.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Проекты')
@ApiCookieAuth('accessToken')
@ApiUnauthorizedResponse()
@ApiNotFoundResponse({
  description: 'Проект или организация отсутствуют/недоступны',
})
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations/:organizationId/projects')
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly members: ProjectMembersService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: ProjectDto })
  @ApiOperation({
    summary: 'Создать проект, добавить создателя и начальные колонки',
  })
  create(
    @Param('organizationId', uuid) orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(orgId, userId, dto);
  }

  @Get()
  @ApiOkResponse({ type: ProjectPageDto })
  list(
    @Param('organizationId', uuid) orgId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ProjectPageQueryDto,
  ) {
    return this.projects.list(orgId, userId, query);
  }

  @Get(':projectId')
  @ApiOkResponse({ type: ProjectDto })
  get(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projects.get(orgId, projectId, userId);
  }

  @Patch(':projectId')
  @ApiOkResponse({ type: ProjectDto })
  update(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(orgId, projectId, userId, dto);
  }

  @Post(':projectId/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: ProjectDto })
  archive(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projects.archive(orgId, projectId, userId);
  }

  @Post(':projectId/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: ProjectDto })
  restore(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projects.restore(orgId, projectId, userId);
  }

  @Delete(':projectId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: TIME.ONE_MINUTE.IN_MS } })
  @ApiOperation({
    summary: 'Owner организации: удалить проект с задачами, подтвердив пароль',
  })
  delete(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteProjectDto,
  ) {
    return this.projects.delete(orgId, projectId, userId, dto);
  }

  @Get(':projectId/members')
  @ApiOkResponse({ type: ProjectMemberPageDto })
  listMembers(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.members.list(orgId, projectId, userId, query);
  }

  @Post(':projectId/members')
  @ApiCreatedResponse({ type: ProjectMemberDto })
  addMember(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.members.add(orgId, projectId, userId, dto);
  }

  @Patch(':projectId/members/:userId/role')
  @ApiOkResponse({ type: ProjectMemberDto })
  updateRole(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
    @Param('userId', uuid) targetId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
  ) {
    return this.members.updateRole(orgId, projectId, userId, targetId, dto);
  }

  @Delete(':projectId/members/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMember(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
    @Param('userId', uuid) targetId: string,
  ) {
    return this.members.remove(orgId, projectId, userId, targetId);
  }

  @Post(':projectId/leave')
  @HttpCode(204)
  @ApiNoContentResponse()
  leave(
    @Param('organizationId', uuid) orgId: string,
    @Param('projectId', uuid) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.members.leave(orgId, projectId, userId);
  }
}
