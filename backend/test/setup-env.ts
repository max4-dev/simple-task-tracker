// Complete Nest's ESM imports before CommonJS plugins require them in Jest's VM.
import '@nestjs/common';
import '@nestjs/core';

// No real database is used in HTTP contract tests; PrismaService is overridden.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';

process.env.REDIS_PASSWORD = 'test-secret';

process.env.JWT_SECRET = 'test-only-secret-at-least-32-characters';
