import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { TokenService } from '../../../common/redis/token.service.js';
import { isJwtPayload } from '../interface/jwt.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          typeof req.cookies?.accessToken === 'string'
            ? req.cookies.accessToken
            : null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: unknown) {
    if (!isJwtPayload(payload) || payload.kind !== 'access')
      throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, tokenVersion: true },
    });
    if (
      !user ||
      user.tokenVersion !== payload.tokenVersion ||
      !(await this.tokens.validateAccessToken(user.id, req.cookies.accessToken))
    )
      throw new UnauthorizedException();
    return user;
  }
}
