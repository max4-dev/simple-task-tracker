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

// One active session per user, as in the existing storage contract.
// Random signed tokens have high entropy; passwords still use Argon2.
@Injectable()
export class TokenService {
  constructor(private readonly redisService: RedisService) {}

  private keys(userId: string) {
    return [`session:{${userId}}:access`, `session:{${userId}}:refresh`];
  }

  async saveTokens(userId: string, tokens: TokenPair): Promise<void> {
    await this.redisService.getClient().eval(
      `
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
      redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
      return 1
    `,
      2,
      ...this.keys(userId),
      digest(tokens.accessToken),
      digest(tokens.refreshToken),
      TOKEN_TTL.access,
      TOKEN_TTL.refresh,
    );
  }

  async rotateTokens(
    userId: string,
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
      ...this.keys(userId),
      digest(previousRefresh),
      digest(tokens.accessToken),
      digest(tokens.refreshToken),
      TOKEN_TTL.access,
      TOKEN_TTL.refresh,
    );
    return result === 1;
  }

  async validateAccessToken(userId: string, token: string): Promise<boolean> {
    return (
      (await this.redisService.getClient().get(this.keys(userId)[0])) ===
      digest(token)
    );
  }

  async validateRefreshToken(userId: string, token: string): Promise<boolean> {
    return (
      (await this.redisService.getClient().get(this.keys(userId)[1])) ===
      digest(token)
    );
  }

  async removeAllUserTokens(userId: string): Promise<void> {
    await this.redisService.getClient().del(...this.keys(userId));
  }

  async revokeSession(userId: string, accessToken: string): Promise<void> {
    // A delayed logout must not delete a more recent login.
    await this.redisService.getClient().eval(
      `
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      return redis.call('DEL', KEYS[1], KEYS[2])
    `,
      2,
      ...this.keys(userId),
      digest(accessToken),
    );
  }
}
