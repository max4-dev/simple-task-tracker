import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { jest } from '@jest/globals';
import { RedisService } from '../src/common/redis/redis.service.js';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/common/database/prisma.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const query = jest.fn<() => Promise<{ value: number }[]>>();
  const ping = jest.fn<() => Promise<string>>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue(new ThrottlerStorageService())
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: query })
      .overrideProvider(RedisService)
      .useValue({ getClient: () => ({ ping }) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    query.mockReset().mockResolvedValue([{ value: 1 }]);
    ping.mockReset().mockResolvedValue('PONG');
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports Redis failures without leaking details', async () => {
    ping.mockRejectedValue(new Error('secret'));
    await request(app.getHttpServer()).get('/health/ready').expect(503);
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('reports readiness only when the database responds', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect('Cache-Control', 'no-store')
      .expect(200, { status: 'ok' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without leaking driver details when the database is down', async () => {
    query.mockRejectedValue(
      new Error('postgres://private:password@internal/db'),
    );
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(response.body.message).toBe('A required service is unavailable');
    expect(response.text).not.toContain('password');
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok' });
  });
});
