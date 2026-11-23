import { jest } from '@jest/globals';
import { hash } from 'argon2';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../../common/database/prisma.service.js';
import type { TokenService } from '../../common/redis/token.service.js';
import type { TokenCookieService } from './services/token-cookie.service.js';

describe('authentication failure boundaries', () => {
  const dto = {
    email: 'person@example.test',
    name: 'Person',
    password: 'long-test-password',
  };
  const save = jest.fn<(...args: unknown[]) => Promise<void>>();
  const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const find = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const set = jest.fn();
  const clear = jest.fn();
  const service = new AuthService(
    new JwtService({ secret: 'test-secret-at-least-32-characters' }),
    {
      user: { create, findFirst: find, findUnique: find },
    } as unknown as PrismaService,
    { saveTokens: save } as unknown as TokenService,
    {
      setAuthCookies: set,
      clearAuthCookie: clear,
    } as unknown as TokenCookieService,
  );
  const response = {} as Response;
  beforeEach(() => {
    jest.clearAllMocks();
    save.mockReset().mockResolvedValue(undefined);
  });

  it('reports a committed account explicitly when session persistence fails', async () => {
    create.mockResolvedValue({ id: 'user', tokenVersion: 0, ...dto });
    save.mockRejectedValue(new Error('private-driver-details'));
    await expect(service.register(dto, response)).resolves.toEqual({
      user: { id: 'user', email: dto.email, name: dto.name },
      authenticated: false,
      code: 'SESSION_UNAVAILABLE',
    });
    expect(set).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith(response);
  });

  it('does not misreport a database failure as a created account', async () => {
    create.mockRejectedValue(new Error('database failed'));
    await expect(service.register(dto, response)).rejects.toThrow(
      'database failed',
    );
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('rejects a delayed login after the credential version changes', async () => {
    find
      .mockReset()
      .mockResolvedValueOnce({
        id: 'user',
        tokenVersion: 3,
        password: await hash(dto.password),
      })
      .mockResolvedValueOnce({ tokenVersion: 4 });
    await expect(service.login(dto, response)).rejects.toMatchObject({
      status: 401,
    });
    expect(save).toHaveBeenCalledWith('user', 3, expect.any(Object));
    expect(set).not.toHaveBeenCalled();
  });
});
