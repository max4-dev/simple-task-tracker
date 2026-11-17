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
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { PageQueryDto } from '../organization/dto/organization.dto.js';
import { ProjectStatusesService } from './project-statuses.service.js';
import { ProjectTagsService } from './project-tags.service.js';
import {
  CreateProjectStatusDto,
  CreateProjectTagDto,
  DeleteProjectStatusDto,
  ProjectStatusDto,
  ProjectTagDto,
  ProjectTagPageDto,
  UpdateProjectStatusDto,
  UpdateProjectTagDto,
} from './dto/project-board.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Статусы проекта')
@ApiCookieAuth('accessToken')
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations/:organizationId/projects/:projectId/statuses')
export class ProjectStatusesController {
  constructor(private readonly statuses: ProjectStatusesService) {}

  @Get()
  @ApiOkResponse({ type: [ProjectStatusDto] })
  list(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
  ) {
    return this.statuses.list(org, project, user);
  }

  @Post()
  @ApiCreatedResponse({ type: ProjectStatusDto })
  create(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Body() dto: CreateProjectStatusDto,
  ) {
    return this.statuses.create(org, project, user, dto);
  }

  @Patch(':statusId')
  @ApiOkResponse({ type: ProjectStatusDto })
  update(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('statusId', uuid) id: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.statuses.update(org, project, user, id, dto);
  }

  @Delete(':statusId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({
    summary: 'Удалить статус; для занятого статуса указать replacementStatusId',
  })
  delete(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('statusId', uuid) id: string,
    @Body() dto: DeleteProjectStatusDto,
  ) {
    return this.statuses.delete(org, project, user, id, dto);
  }
}

@ApiTags('Теги проекта')
@ApiCookieAuth('accessToken')
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations/:organizationId/projects/:projectId/tags')
export class ProjectTagsController {
  constructor(private readonly tags: ProjectTagsService) {}

  @Get()
  @ApiOkResponse({ type: ProjectTagPageDto })
  list(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Query() query: PageQueryDto,
  ) {
    return this.tags.list(org, project, user, query);
  }

  @Post()
  @ApiCreatedResponse({ type: ProjectTagDto })
  create(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Body() dto: CreateProjectTagDto,
  ) {
    return this.tags.create(org, project, user, dto);
  }

  @Patch(':tagId')
  @ApiOkResponse({ type: ProjectTagDto })
  update(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('tagId', uuid) id: string,
    @Body() dto: UpdateProjectTagDto,
  ) {
    return this.tags.update(org, project, user, id, dto);
  }

  @Delete(':tagId')
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('tagId', uuid) id: string,
  ) {
    return this.tags.delete(org, project, user, id);
  }
}
