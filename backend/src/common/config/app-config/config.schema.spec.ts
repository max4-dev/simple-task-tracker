import { validateConfig } from './config.schema.js';

const databaseUrl = 'postgresql://app:secret@localhost:5432/task_tracker';

describe('validateConfig', () => {
  it('sets bounded connection defaults and parses numeric environment values', () => {
    const config = validateConfig({
      DATABASE_URL: databaseUrl,
      REDIS_PASSWORD: 'test-secret',
      JWT_SECRET: 'test-only-secret-at-least-32-characters',
      PORT: '4000',
    });
    expect(config.PORT).toBe(4000);
    expect(config.DATABASE_POOL_SIZE).toBe(10);
    expect(config.DATABASE_QUERY_TIMEOUT_MS).toBe(5000);
  });

  it.each([
    undefined,
    '',
    'https://app:secret@host/db',
    'postgres://host/db',
    'postgres://app:secret@host/',
  ])('rejects an invalid database URL without exposing credentials', (url) => {
    expect(() => validateConfig({ DATABASE_URL: url })).toThrow('DATABASE_URL');
  });

  it.each([
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '3.5'],
    ['DATABASE_POOL_SIZE', '-1'],
    ['DATABASE_POOL_SIZE', '101'],
    ['DATABASE_CONNECTION_TIMEOUT_MS', 'NaN'],
    ['DATABASE_QUERY_TIMEOUT_MS', '0'],
    ['DATABASE_IDLE_TIMEOUT_MS', ''],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(() =>
      validateConfig({
        DATABASE_URL: databaseUrl,
        REDIS_PASSWORD: 'test-secret',
        JWT_SECRET: 'test-only-secret-at-least-32-characters',
        [key]: value,
      }),
    ).toThrow(key);
  });

  it('rejects an unknown environment', () => {
    expect(() =>
      validateConfig({
        DATABASE_URL: databaseUrl,
        REDIS_PASSWORD: 'test-secret',
        JWT_SECRET: 'test-only-secret-at-least-32-characters',
        NODE_ENV: 'prod',
      }),
    ).toThrow('NODE_ENV');
  });
});

describe('Redis configuration', () => {
  const input = {
    DATABASE_URL: databaseUrl,
    REDIS_PASSWORD: 'test-secret',
    JWT_SECRET: 'test-only-secret-at-least-32-characters',
  };
  it('parses false as false rather than a truthy string', () => {
    expect(validateConfig({ ...input, REDIS_TLS: 'false' }).REDIS_TLS).toBe(
      false,
    );
    expect(validateConfig({ ...input, REDIS_TLS: 'true' }).REDIS_TLS).toBe(
      true,
    );
    expect(validateConfig({ ...input, REDIS_PORT: '6380' }).REDIS_PORT).toBe(
      6380,
    );
  });
  it.each([{ REDIS_PASSWORD: '' }, { REDIS_PORT: '0' }, { REDIS_TLS: 'yes' }])(
    'rejects invalid Redis settings',
    (invalid) => {
      expect(() => validateConfig({ ...input, ...invalid })).toThrow('REDIS_');
    },
  );
  it('does not print secrets in validation errors', () => {
    try {
      validateConfig({ ...input, DATABASE_URL: 'invalid:private-secret' });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      expect(error.message).not.toContain('private-secret');
    }
  });
});

describe('HTTP authentication configuration', () => {
  const input = {
    DATABASE_URL: databaseUrl,
    REDIS_PASSWORD: 'test-secret',
    JWT_SECRET: 'test-only-secret-at-least-32-characters',
  };
  it('parses exact origins and rejects wildcard, paths and credentials', () => {
    expect(
      validateConfig({
        ...input,
        TRUSTED_ORIGINS: 'https://app.example.com,https://api.example.com',
      }).TRUSTED_ORIGINS,
    ).toEqual([
      'https://app.example.com',
      'https://api.example.com',
      'http://localhost:3001',
    ]);
    for (const origin of [
      '*',
      'null',
      '',
      'https://app.example.com/',
      'https://user:password@app.example.com',
    ]) {
      expect(() =>
        validateConfig({ ...input, TRUSTED_ORIGINS: origin }),
      ).toThrow('TRUSTED_ORIGINS');
    }
  });
  it('requires a signing secret without displaying its value', () => {
    for (const secret of [undefined, '', 'too-short']) {
      expect(() => validateConfig({ ...input, JWT_SECRET: secret })).toThrow(
        'JWT_SECRET',
      );
    }
  });
});
