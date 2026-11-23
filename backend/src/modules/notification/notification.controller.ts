import {
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import { NotificationService } from './notification.service.js';
import {
  NotificationCountDto,
  NotificationReadDto,
  NotificationPageDto,
  NotificationQueryDto,
} from './dto/notification.dto.js';
@ApiTags('Уведомления')
@ApiCookieAuth('accessToken')
@Auth()
@UseInterceptors(NoStoreInterceptor)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}
  @Get()
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiOperation({ summary: 'Личный список уведомлений' })
  list(@CurrentUser('id') user: string, @Query() query: NotificationQueryDto) {
    return this.notifications.list(user, query);
  }
  @Get('unread-count')
  @ApiOkResponse({ type: NotificationCountDto })
  unread(@CurrentUser('id') user: string) {
    return this.notifications.unread(user);
  }
  @Patch('read-all')
  @ApiOkResponse({ type: NotificationCountDto })
  readAll(@CurrentUser('id') user: string) {
    return this.notifications.readAll(user);
  }
  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationReadDto })
  @ApiOperation({
    summary: 'Отметить своё уведомление прочитанным, повтор безопасен',
  })
  read(
    @CurrentUser('id') user: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notifications.read(user, id);
  }
}
