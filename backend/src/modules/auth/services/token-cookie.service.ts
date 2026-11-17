import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { TIME } from '../../../common/constants/index.js';
import {
  TOKEN_TTL,
  type TokenPair,
} from '../../../common/redis/token.service.js';

@Injectable()
export class TokenCookieService {
  constructor(private readonly config: ConfigService) {}

  private options() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  setAuthCookies(res: Response, tokens: TokenPair): void {
    res.cookie('accessToken', tokens.accessToken, {
      ...this.options(),
      maxAge: TOKEN_TTL.access * TIME.ONE_SECOND.IN_MS,
    });
    res.cookie('refreshToken', tokens.refreshToken, {
      ...this.options(),
      maxAge: TOKEN_TTL.refresh * TIME.ONE_SECOND.IN_MS,
    });
  }

  clearAuthCookie(res: Response): void {
    res.clearCookie('accessToken', this.options());
    res.clearCookie('refreshToken', this.options());
  }

  getRefreshToken(req: Request): string | undefined {
    return typeof req.cookies?.refreshToken === 'string'
      ? req.cookies.refreshToken
      : undefined;
  }
}
