import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { type INestApplication, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { RedisService } from '../src/common/redis/redis.service.js';
import { TokenService } from '../src/common/redis/token.service.js';
import { UserService } from '../src/modules/user/user.service.js';

describe('User HTTP contract (database/session storage mocked)', () => {
  let app: INestApplication;
  let cookie: string;
  const id = 'a1f56686-60f0-4b8a-b9e5-a33e5803db7d';
  const otherId = 'b2f56686-60f0-4b8a-b9e5-a33e5803db7d';
  const findUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const validSession = jest.fn<() => Promise<boolean>>();
  const users = {
    getProfile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    getColleagueProfile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    updateProfile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    updatePassword: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const sign = (payload = {}) =>
    new JwtService({ secret: process.env.JWT_SECRET }).sign(
      { id, tokenVersion: 0, kind: 'access', ...payload },
      { expiresIn: 60 },
    );

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique } })
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(TokenService)
      .useValue({ validateAccessToken: validSession })
      .overrideProvider(UserService)
      .useValue(users)
      .compile();
    app = fixture.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({ id, role: 'USER', tokenVersion: 0 });
    validSession.mockResolvedValue(true);
    users.getProfile.mockResolvedValue({ id, name: 'Ada' });
    users.updateProfile.mockResolvedValue({ id, name: 'Updated' });
    users.updatePassword.mockResolvedValue({ message: 'Updated' });
    users.getColleagueProfile.mockResolvedValue({ id: otherId });
    cookie = 'accessToken=' + sign();
  });
  afterAll(async () => {
    await app.close();
  });

  it('is mounted in AppModule, authenticates cookies and disables profile caching', async () => {
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Cookie', cookie)
      .expect('Cache-Control', 'no-store')
      .expect(200, { id, name: 'Ada' });
    expect(users.getProfile).toHaveBeenCalledWith(id);
  });
  it('rejects missing cookie and bearer-only authentication', async () => {
    await request(app.getHttpServer()).get('/users/profile').expect(401);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', 'Bearer ' + sign())
      .expect(401);
    expect(users.getProfile).not.toHaveBeenCalled();
  });
  it('rejects refresh tokens in the access cookie', async () => {
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Cookie', 'accessToken=' + sign({ kind: 'refresh' }))
      .expect(401);
  });
  it('rejects revoked, deleted-user and stale-version sessions', async () => {
    validSession.mockResolvedValue(false);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Cookie', cookie)
      .expect(401);
    validSession.mockResolvedValue(true);
    findUnique.mockResolvedValue({ id, role: 'USER', tokenVersion: 1 });
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Cookie', cookie)
      .expect(401);
    findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Cookie', cookie)
      .expect(401);
  });
  it('rejects expired tokens', async () => {
    const expired = new JwtService({ secret: process.env.JWT_SECRET }).sign(
      { id, tokenVersion: 0, kind: 'access' },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Cookie', 'accessToken=' + expired)
      .expect(401);
  });
  it('rejects foreign and missing Origin on cookie writes', async () => {
    for (const origin of [undefined, 'https://evil.example']) {
      const req = request(app.getHttpServer())
        .patch('/users/profile')
        .set('Cookie', cookie);
      if (origin) req.set('Origin', origin);
      await req.send({ name: 'Updated' }).expect(403);
    }
    expect(users.updateProfile).not.toHaveBeenCalled();
  });
  it('validates writes and always takes the target identity from the session', async () => {
    await request(app.getHttpServer())
      .patch('/users/profile')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .send({ id: otherId, role: 'ADMIN' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/users/profile')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .send({ name: ' Updated ' })
      .expect(200);
    expect(users.updateProfile).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ name: 'Updated' }),
    );
  });
  it('validates UUID and passes both viewer and target to authorization', async () => {
    await request(app.getHttpServer())
      .get('/users/123')
      .set('Cookie', cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/users/' + otherId)
      .set('Cookie', cookie)
      .expect(200);
    expect(users.getColleagueProfile).toHaveBeenCalledWith(id, otherId);
    users.getColleagueProfile.mockRejectedValue(new NotFoundException());
    await request(app.getHttpServer())
      .get('/users/' + otherId)
      .set('Cookie', cookie)
      .expect(404);
  });
  it('clears both cookies on successful password change', async () => {
    const response = await request(app.getHttpServer())
      .put('/users/password')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .send({ password: 'old-password', newPassword: 'new-password-long' })
      .expect(200);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^accessToken=;.*HttpOnly; SameSite=Lax/),
        expect.stringMatching(/^refreshToken=;.*HttpOnly; SameSite=Lax/),
      ]),
    );
  });
  it('publishes profile schemas and cookie security in Swagger', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(
      response.body.paths['/users/profile'].patch.requestBody,
    ).toBeDefined();
    expect(
      response.body.components.schemas.UserProfileDto.properties.email,
    ).toBeUndefined();
    expect(response.body.components.securitySchemes.accessToken.in).toBe(
      'cookie',
    );
  });
});
