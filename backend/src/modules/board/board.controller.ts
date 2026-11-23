import { MoveTaskDto, MoveTaskResponseDto } from './dto/board.dto.js';
import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { BoardService } from './board.service.js';
import {
  BoardColumnPageDto,
  BoardColumnQueryDto,
  BoardDto,
  BoardQueryDto,
  ColumnOrderDto,
  ReorderColumnsDto,
} from './dto/board.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Доска проекта')
@ApiCookieAuth('accessToken')
@ApiResponse({ status: 400, description: 'Некорректные параметры или курсор' })
@ApiResponse({ status: 401, description: 'Требуется вход' })
@ApiResponse({ status: 404, description: 'Проект или колонка недоступны' })
@ApiResponse({
  status: 409,
  description:
    'BOARD_CHANGED / TASK_REVISION_CONFLICT: обновите данные; либо ресурс в архиве',
})
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations/:organizationId/projects/:projectId')
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get('board')
  @ApiOkResponse({ type: BoardDto })
  @ApiOperation({
    summary: 'Колонки с ограниченным набором карточек и количеством совпадений',
  })
  get(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Query() query: BoardQueryDto,
  ) {
    return this.board.get(org, project, user, query);
  }

  @Get('board/columns/:statusId/tasks')
  @ApiOkResponse({ type: BoardColumnPageDto })
  @ApiOperation({
    summary: 'Страница активных карточек колонки; сортировка position + id',
  })
  column(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('statusId', uuid) status: string,
    @Query() query: BoardColumnQueryDto,
  ) {
    return this.board.column(org, project, user, status, query);
  }

  @Put('board/columns/order')
  @ApiOkResponse({ type: ColumnOrderDto })
  @ApiOperation({ summary: 'Атомарно задать полный порядок колонок' })
  reorder(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Body() dto: ReorderColumnsDto,
  ) {
    return this.board.reorderColumns(org, project, user, dto);
  }
  @Post('tasks/:taskId/move')
  @HttpCode(200)
  @ApiOkResponse({ type: MoveTaskResponseDto })
  @ApiOperation({
    summary: 'Переместить карточку между соседями в полном порядке колонки',
  })
  move(
    @Param('organizationId', uuid) org: string,
    @Param('projectId', uuid) project: string,
    @CurrentUser('id') user: string,
    @Param('taskId', uuid) task: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.board.move(org, project, user, task, dto);
  }
}
