import { ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { RedisService } from './redis.service.js';

// Fixed window + bounded blocking period, atomically shared by all API replicas.
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ) {
    const digest = createHash('sha256')
      .update(name + ':' + key)
      .digest('hex');
    try {
      const result = (await this.redis.getClient().eval(
        `
        local blocked = redis.call('PTTL', KEYS[2])
        if blocked > 0 then
          return {tonumber(redis.call('GET', KEYS[1]) or '0'), math.max(0, redis.call('PTTL', KEYS[1])), 1, blocked}
        end
        local hits = redis.call('INCR', KEYS[1])
        if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
        local remaining = redis.call('PTTL', KEYS[1])
        if hits > tonumber(ARGV[2]) then
          redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
          return {hits, remaining, 1, tonumber(ARGV[3])}
        end
        return {hits, remaining, 0, 0}
      `,
        2,
        `rate:{${digest}}:window`,
        `rate:{${digest}}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as number[];
      return {
        totalHits: result[0],
        timeToExpire: Math.ceil(result[1] / 1000),
        isBlocked: result[2] === 1,
        timeToBlockExpire: Math.ceil(result[3] / 1000),
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Проверка лимитов временно недоступна',
      });
    }
  }
}
