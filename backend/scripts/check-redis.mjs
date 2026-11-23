import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../dist/common/redis/redis.service.js';
import { TokenService } from '../dist/common/redis/token.service.js';
import { RedisThrottlerStorage } from '../dist/common/redis/throttler.storage.js';

export async function checkRedis(redis) {
  const tokens = new TokenService(redis);
  const id = 'check-' + randomUUID();
  const first = { accessToken: randomUUID(), refreshToken: randomUUID() };
  const next = { accessToken: randomUUID(), refreshToken: randomUUID() };
  try {
    assert.equal(await redis.getClient().ping(), 'PONG');
    await tokens.saveTokens(id, 0, first);
    assert.equal(
      await tokens.validateAccessToken(id, 0, first.accessToken),
      true,
    );
    assert.equal(await tokens.validateAccessToken(id, 0, 'wrong'), false);
    const key = `session:v2:{${id}}:0:access`;
    assert.notEqual(await redis.getClient().get(key), first.accessToken);
    assert.ok((await redis.getClient().ttl(key)) > 0);
    const races = await Promise.all([
      tokens.rotateTokens(id, 0, first.refreshToken, next),
      tokens.rotateTokens(id, 0, first.refreshToken, next),
    ]);
    assert.equal(races.filter(Boolean).length, 1);
    await tokens.saveTokens(id, 1, first);
    await tokens.removeTokenVersion(id, 0);
    assert.equal(
      await tokens.validateAccessToken(id, 1, first.accessToken),
      true,
    );
    await tokens.saveTokens(id, 0, next); // a delayed old login cannot overwrite generation 1
    assert.equal(
      await tokens.validateAccessToken(id, 1, first.accessToken),
      true,
    );
    await tokens.revokeSession(id, 1, 'stale');
    assert.equal(
      await tokens.validateAccessToken(id, 1, first.accessToken),
      true,
    );
    await tokens.revokeSession(id, 1, first.accessToken);
    assert.equal(
      await tokens.validateRefreshToken(id, 1, first.refreshToken),
      false,
    );
    const a = new RedisThrottlerStorage(redis);
    const b = new RedisThrottlerStorage(redis);
    assert.equal((await a.increment(id, 200, 1, 300, 'test')).isBlocked, false);
    assert.equal((await b.increment(id, 200, 1, 300, 'test')).isBlocked, true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal((await b.increment(id, 200, 1, 300, 'test')).isBlocked, false);
    console.log(
      'PASS: real Redis token hashes/TTL, atomic rotation, generation isolation and shared rate limits',
    );
  } finally {
    await Promise.all([
      tokens.removeTokenVersion(id, 0),
      tokens.removeTokenVersion(id, 1),
    ]);
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (!process.env.REDIS_PASSWORD) {
    console.error('REDIS_PASSWORD is required');
    process.exit(1);
  }
  const redis = new RedisService(
    new ConfigService({
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      REDIS_TLS: process.env.REDIS_TLS === 'true',
      REDIS_CONNECT_TIMEOUT_MS: 5000,
      REDIS_COMMAND_TIMEOUT_MS: 5000,
    }),
  );
  try {
    await redis.onModuleInit();
    await checkRedis(redis);
  } catch {
    console.error('Redis check failed; check connectivity and configuration.');
    process.exitCode = 1;
  } finally {
    await redis.onApplicationShutdown();
  }
}
