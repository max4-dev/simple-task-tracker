import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { TaskService } from './task.service.js';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  ReplaceTaskAssignmentsDto,
  TaskPageQueryDto,
  TaskRevisionDto,
  UpdateTaskDto,
} from './dto/task-input.dto.js';
import {
  TaskDto,
  TaskEventPageDto,
  TaskPageDto,
} from './dto/task-response.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Задачи')
@ApiCookieAuth('accessToken')
@ApiResponse({ status: 400, description: 'Некорректный запрос' })
@ApiResponse({ status: 401, description: 'Требуется вход' })
@ApiResponse({ status: 404, description: 'Ресурс не найден или недоступен' })
@ApiResponse({
  status: 409,
  description: 'Конфликт версии или архивный ресурс',
})
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations/:organizationId/projects/:projectId/tasks')
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Post()
  @ApiCreatedResponse({ type: TaskDto })
  @ApiOperation({ summary: 'Создать задачу' })
  create(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(org, project, user, dto);
  }

  @Get()
  @ApiOkResponse({ type: TaskPageDto })
  @ApiOperation({ summary: 'Список задач с фильтрами' })
  list(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(org, project, user, query);
  }

  @Get(':taskId')
  @ApiOkResponse({ type: TaskDto })
  @ApiOperation({ summary: 'Получить задачу' })
  get(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) id: string,
  ) {
    return this.tasks.get(org, project, user, id);
  }

  @Patch(':taskId')
  @ApiOkResponse({ type: TaskDto })
  @ApiOperation({ summary: 'Обновить задачу по ожидаемой версии' })
  update(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(org, project, user, id, dto);
  }

  @Put(':taskId/assignments')
  @ApiOkResponse({ type: TaskDto })
  @ApiOperation({
    summary: 'Заменить набор ответственных, исполнителей и ревьюеров',
  })
  replaceAssignments(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) id: string,
    @Body() dto: ReplaceTaskAssignmentsDto,
  ) {
    return this.tasks.replaceAssignments(org, project, user, id, dto);
  }

  @Post(':taskId/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: TaskDto })
  @ApiOperation({ summary: 'Архивировать задачу' })
  archive(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) id: string,
    @Body() dto: TaskRevisionDto,
  ) {
    return this.tasks.archive(org, project, user, id, dto, true);
  }

  @Post(':taskId/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: TaskDto })
  @ApiOperation({ summary: 'Восстановить задачу' })
  restore(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) id: string,
    @Body() dto: TaskRevisionDto,
  ) {
    return this.tasks.archive(org, project, user, id, dto, false);
  }

  @Get(':taskId/history')
  @ApiOkResponse({ type: TaskEventPageDto })
  @ApiOperation({ summary: 'История изменений задачи' })
  history(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) id: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.tasks.history(org, project, user, id, query);
  }
}
