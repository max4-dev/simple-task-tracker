import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { validateConfig } from '../config/app-config/index.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService lifecycle', () => {
  function createService() {
    const config = validateConfig({
      JWT_SECRET: 'test-only-secret-at-least-32-characters',
      REDIS_PASSWORD: 'test-secret',
      DATABASE_URL: 'postgresql://app:secret@localhost:5432/test',
    });
    return new PrismaService(new ConfigService(config));
  }

  it('fails startup and closes the pool when the database is unavailable', async () => {
    const prisma = createService();
    jest
      .spyOn(prisma, '$connect')
      .mockRejectedValue(new Error('private driver details'));
    const disconnect = jest
      .spyOn(prisma, '$disconnect')
      .mockResolvedValue(undefined);

    await expect(prisma.onModuleInit()).rejects.toThrow(
      'Database connection failed; check connectivity and credentials',
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('checks the connection and disconnects during shutdown', async () => {
    const prisma = createService();
    jest.spyOn(prisma, '$connect').mockResolvedValue(undefined);
    const query = jest
      .spyOn(prisma, '$queryRaw')
      .mockResolvedValue([{ value: 1 }]);
    const disconnect = jest
      .spyOn(prisma, '$disconnect')
      .mockResolvedValue(undefined);

    await prisma.onModuleInit();
    expect(query).toHaveBeenCalledTimes(1);
    await prisma.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
