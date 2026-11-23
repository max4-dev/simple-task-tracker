import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { RedisService } from '../src/common/redis/redis.service.js';
import { TokenService } from '../src/common/redis/token.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { UserService } from '../src/modules/user/user.service.js';

async function fixture(proxies: string[] = []) {
  const updatePassword = jest
    .fn<() => Promise<never>>()
    .mockRejectedValue(new BadRequestException('Wrong password'));
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      user: {
        findUnique: ({ where }: { where: { id: string } }) => ({
          id: where.id,
          role: 'USER',
          tokenVersion: 0,
        }),
      },
    })
    .overrideProvider(RedisService)
    .useValue({})
    .overrideProvider(TokenService)
    .useValue({ validateAccessToken: () => true })
    .overrideProvider(ThrottlerStorage)
    .useValue(new ThrottlerStorageService())
    .overrideProvider(AuthService)
    .useValue({ login: () => ({ authenticated: true }) })
    .overrideProvider(UserService)
    .useValue({ updatePassword })
    .compile();
  const app = module.createNestApplication();
  app.get(ConfigService).set('TRUSTED_PROXY_CIDRS', proxies);
  configureHttp(app);
  await app.init();
  const cookie = (id: string) =>
    'accessToken=' +
    new JwtService({ secret: process.env.JWT_SECRET }).sign(
      { id, tokenVersion: 0, kind: 'access' },
      { expiresIn: 60 },
    );
  const change = (id: string) =>
    request(app.getHttpServer())
      .put('/users/password')
      .set('Cookie', cookie(id))
      .set('Origin', 'http://localhost:3000')
      .send({ password: 'wrong', newPassword: 'long-new-password' });
  return { app, updatePassword, change };
}

describe('foundation HTTP regressions (storage mocked)', () => {
  it.each([false, true])(
    'trusts forwarded client addresses only for configured proxy peers: %s',
    async (trusted) => {
      const { app } = await fixture(trusted ? ['127.0.0.1/32', '::1/128'] : []);
      try {
        for (let i = 0; i < 11; i++)
          await request(app.getHttpServer())
            .post('/auth/login')
            .set('X-Forwarded-For', '192.0.2.' + (i + 1))
            .set('Origin', 'http://localhost:3000')
            .send({ email: 'user@example.test', password: 'password' })
            .expect(trusted || i < 10 ? 201 : 429);
      } finally {
        await app.close();
      }
    },
  );

  it('limits password attempts per authenticated user without blocking another user', async () => {
    const { app, change, updatePassword } = await fixture();
    try {
      const id = randomUUID();
      for (let i = 0; i < 5; i++) await change(id).expect(400);
      const blocked = await change(id).expect(429);
      expect(updatePassword).toHaveBeenCalledTimes(5);
      expect(blocked.body.code).toBe('RATE_LIMITED');
      expect(blocked.body.requestId).toBe(blocked.headers['x-request-id']);
      await change(randomUUID()).expect(400);
    } finally {
      await app.close();
    }
  });

  it('bounds attempts per IP even when the actor rotates accounts', async () => {
    const { app, change, updatePassword } = await fixture();
    try {
      for (let i = 0; i < 20; i++) await change(randomUUID()).expect(400);
      await change(randomUUID()).expect(429);
      expect(updatePassword).toHaveBeenCalledTimes(20);
    } finally {
      await app.close();
    }
  });
});
