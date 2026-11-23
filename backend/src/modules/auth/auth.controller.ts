import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiCookieAuth, ApiTags, ApiCreatedResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { TIME } from '../../common/constants/index.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { AuthService } from './auth.service.js';
import { Auth } from './decorators/auth.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SessionDto } from './dto/session.dto.js';
import type { AuthenticatedUser } from './interface/jwt.interface.js';

@ApiTags('Авторизация')
@UseInterceptors(NoStoreInterceptor)
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: TIME.ONE_MINUTE.IN_MS } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiCreatedResponse({ type: SessionDto })
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  @ApiCreatedResponse({ type: SessionDto })
  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

  @ApiCreatedResponse({ type: SessionDto })
  @Post('refresh-token')
  getNewTokens(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.getNewTokens(req, res);
  }

  @ApiCookieAuth('accessToken')
  @Auth()
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return { user: { id: user.id } };
  }

  @ApiCookieAuth('accessToken')
  @Auth()
  @Post('logout')
  logout(
    @CurrentUser('id') id: string,
    @CurrentUser('tokenVersion') version: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(id, version, req, res);
  }
}
