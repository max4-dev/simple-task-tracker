import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../../common/database/prisma.service.js';
import { TokenService, TOKEN_TTL } from '../../common/redis/token.service.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { isJwtPayload } from './interface/jwt.interface.js';
import { TokenCookieService } from './services/token-cookie.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly cookies: TokenCookieService,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          name: dto.name.trim(),
          password: await hash(dto.password),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Email уже используется');
      throw error;
    }
    await this.startSession(user, res);
    return { user: this.present(user) };
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.validateUser(dto);
    await this.startSession(user, res);
    return { user: this.present(user) };
  }

  private async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: dto.email.trim().toLowerCase(), mode: 'insensitive' },
      },
    });
    if (!user || !(await verify(user.password, dto.password)))
      throw new BadRequestException('Неверные данные');
    return user;
  }

  async getNewTokens(req: Request, res: Response) {
    const refresh = this.cookies.getRefreshToken(req);
    if (!refresh) throw new UnauthorizedException();
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(refresh, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException();
    }
    if (!isJwtPayload(payload) || payload.kind !== 'refresh')
      throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
    });
    if (!user || user.tokenVersion !== payload.tokenVersion)
      throw new UnauthorizedException();
    const tokens = this.issueTokens(user);
    if (!(await this.tokens.rotateTokens(user.id, refresh, tokens)))
      throw new UnauthorizedException();
    this.cookies.setAuthCookies(res, tokens);
    return { user: this.present(user) };
  }

  async logout(userId: string, req: Request, res: Response) {
    await this.tokens.revokeSession(userId, req.cookies.accessToken);
    this.cookies.clearAuthCookie(res);
    return { message: 'Успешный выход' };
  }

  private async startSession(user: User, res: Response) {
    const tokens = this.issueTokens(user);
    await this.tokens.saveTokens(user.id, tokens);
    this.cookies.setAuthCookies(res, tokens);
  }

  private issueTokens(user: User) {
    const payload = { id: user.id, tokenVersion: user.tokenVersion };
    return {
      accessToken: this.jwt.sign(
        { ...payload, kind: 'access' },
        {
          algorithm: 'HS256',
          jwtid: randomUUID(),
          expiresIn: TOKEN_TTL.access,
        },
      ),
      refreshToken: this.jwt.sign(
        { ...payload, kind: 'refresh' },
        {
          algorithm: 'HS256',
          jwtid: randomUUID(),
          expiresIn: TOKEN_TTL.refresh,
        },
      ),
    };
  }

  private present(user: User) {
    return { id: user.id, email: user.email, name: user.name };
  }
}
