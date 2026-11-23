import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from './redis.service.js';
import { TIME } from '../constants/index.js';

export const TOKEN_TTL = {
  access: 7 * TIME.ONE_HOUR.IN_SEC,
  refresh: 30 * TIME.ONE_DAY.IN_SEC,
} as const;
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

// One active session per credential version. Old generations cannot replace or delete newer sessions.
// Random signed tokens have high entropy; passwords still use Argon2.
@Injectable()
export class TokenService {
  constructor(private readonly redisService: RedisService) {}

  private keys(userId: string, version: number) {
    return [
      `session:v2:{${userId}}:${version}:access`,
      `session:v2:{${userId}}:${version}:refresh`,
    ];
  }

  async saveTokens(
    userId: string,
    version: number,
    tokens: TokenPair,
  ): Promise<void> {
    await this.redisService.getClient().eval(
      `
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
      redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
      return 1
    `,
      2,
      ...this.keys(userId, version),
      digest(tokens.accessToken),
      digest(tokens.refreshToken),
      TOKEN_TTL.access,
      TOKEN_TTL.refresh,
    );
  }

  async rotateTokens(
    userId: string,
    version: number,
    previousRefresh: string,
    tokens: TokenPair,
  ): Promise<boolean> {
    const result = await this.redisService.getClient().eval(
      `
      if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
      redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
      redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[5])
      return 1
    `,
      2,
      ...this.keys(userId, version),
      digest(previousRefresh),
      digest(tokens.accessToken),
      digest(tokens.refreshToken),
      TOKEN_TTL.access,
      TOKEN_TTL.refresh,
    );
    return result === 1;
  }

  async validateAccessToken(
    userId: string,
    version: number,
    token: string,
  ): Promise<boolean> {
    return (
      (await this.redisService
        .getClient()
        .get(this.keys(userId, version)[0])) === digest(token)
    );
  }

  async validateRefreshToken(
    userId: string,
    version: number,
    token: string,
  ): Promise<boolean> {
    return (
      (await this.redisService
        .getClient()
        .get(this.keys(userId, version)[1])) === digest(token)
    );
  }

  async removeTokenVersion(userId: string, version: number): Promise<void> {
    await this.redisService.getClient().del(...this.keys(userId, version));
  }

  async revokeSession(
    userId: string,
    version: number,
    accessToken: string,
  ): Promise<void> {
    // A delayed logout must not delete a more recent login.
    await this.redisService.getClient().eval(
      `
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      return redis.call('DEL', KEYS[1], KEYS[2])
    `,
      2,
      ...this.keys(userId, version),
      digest(accessToken),
    );
  }
}
