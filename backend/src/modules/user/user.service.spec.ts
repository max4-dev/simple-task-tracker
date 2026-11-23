import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { UserService } from './user.service.js';
import type { PrismaService } from '../../common/database/prisma.service.js';
import type { TokenService } from '../../common/redis/token.service.js';

describe('UserService password change', () => {
  const findUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const updateMany =
    jest.fn<(...args: unknown[]) => Promise<{ count: number }>>();
  const revoke = jest.fn<(id: string, version: number) => Promise<void>>();
  const service = new UserService(
    { user: { findUnique, updateMany } } as unknown as PrismaService,
    { removeTokenVersion: revoke } as unknown as TokenService,
  );
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash('current-password');
  });
  beforeEach(() => {
    findUnique
      .mockReset()
      .mockResolvedValue({ password: passwordHash, tokenVersion: 3 });
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    revoke.mockReset().mockResolvedValue(undefined);
  });
  it('rejects missing users before any writes', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.updatePassword('user', {
        password: 'current-password',
        newPassword: 'new-long-password',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
  it.each(['incorrect', ''])(
    'rejects an incorrect current password',
    async (password) => {
      await expect(
        service.updatePassword('user', {
          password,
          newPassword: 'new-long-password',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(updateMany).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    },
  );
  it('rejects a no-op password change', async () => {
    await expect(
      service.updatePassword('user', {
        password: 'current-password',
        newPassword: 'current-password',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('stores an Argon2 hash and bumps the version with an optimistic concurrency condition', async () => {
    await service.updatePassword('user', {
      password: 'current-password',
      newPassword: 'new-long-password',
    });
    const update = updateMany.mock.calls[0][0] as {
      where: { id: string; password: string; tokenVersion: number };
      data: { password: string; tokenVersion: { increment: number } };
    };
    expect(update.where).toEqual({
      id: 'user',
      password: passwordHash,
      tokenVersion: 3,
    });
    expect(update.data.tokenVersion).toEqual({ increment: 1 });
    expect(await verify(update.data.password, 'new-long-password')).toBe(true);
    expect(revoke).toHaveBeenCalledWith('user', 3);
  });
  it('rejects a concurrent winner without revoking that newer session', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updatePassword('user', {
        password: 'current-password',
        newPassword: 'new-long-password',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(revoke).not.toHaveBeenCalled();
  });
  it('reports success if Redis cleanup fails after the password and version were committed', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      revoke.mockRejectedValue(new Error('private redis error'));
      await expect(
        service.updatePassword('user', {
          password: 'current-password',
          newPassword: 'new-long-password',
        }),
      ).resolves.toHaveProperty('message');
      expect(warning).toHaveBeenCalledWith(
        'Password changed; stale session cleanup deferred to TTL',
      );
    } finally {
      warning.mockRestore();
    }
  });
});
