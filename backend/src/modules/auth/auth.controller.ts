import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { TIME } from '../../common/constants/index.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { AuthService } from './auth.service.js';
import { Auth } from './decorators/auth.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { AuthenticatedUser } from './interface/jwt.interface.js';

@ApiTags('Авторизация')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: TIME.ONE_MINUTE.IN_MS } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(id, req, res);
  }
}
