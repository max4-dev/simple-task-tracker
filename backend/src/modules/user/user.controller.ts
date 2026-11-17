import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenCookieService } from '../auth/services/token-cookie.service.js';
import { CurrentUser } from './decorators/user.decorator.js';
import {
  ColleagueProfileDto,
  UserDto,
  UserPasswordDto,
  UserProfileDto,
} from './dto/user.dto.js';
import { UserService } from './user.service.js';

@ApiTags('Пользователи')
@ApiCookieAuth('accessToken')
@ApiUnauthorizedResponse({ description: 'Сессия отсутствует или отозвана' })
@Auth()
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly cookies: TokenCookieService,
  ) {}

  @ApiOperation({ summary: 'Мой профиль' })
  @ApiOkResponse({ type: UserDto })
  @Header('Cache-Control', 'no-store')
  @Get('profile')
  getProfile(@CurrentUser('id') id: string) {
    return this.userService.getProfile(id);
  }

  @ApiOperation({
    summary: 'Изменить свой профиль. Email и права здесь не меняются',
  })
  @ApiOkResponse({ type: UserDto })
  @Patch('profile')
  updateProfile(@CurrentUser('id') id: string, @Body() dto: UserProfileDto) {
    return this.userService.updateProfile(id, dto);
  }

  @ApiOperation({ summary: 'Сменить пароль и завершить все сессии' })
  @Put('password')
  async updatePassword(
    @CurrentUser('id') id: string,
    @Body() dto: UserPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.userService.updatePassword(id, dto);
    this.cookies.clearAuthCookie(res);
    return result;
  }

  @ApiOperation({ summary: 'Профиль коллеги и совместные организации/проекты' })
  @ApiOkResponse({ type: ColleagueProfileDto })
  @ApiNotFoundResponse({
    description: 'Нет общего контекста или пользователь не существует',
  })
  @Header('Cache-Control', 'no-store')
  @Get(':id')
  getColleague(
    @CurrentUser('id') viewerId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.userService.getColleagueProfile(viewerId, id);
  }
}
