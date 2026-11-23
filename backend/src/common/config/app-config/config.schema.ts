import { isIP } from 'node:net';
import { z } from 'zod';
import { TIME } from '../../constants/index.js';

export const NodeEnv = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

const integer = (fallback: number, max: number) =>
  z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(z.number().int().min(1).max(max))
    .default(fallback);

export const configSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  NOTIFICATION_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PORT: integer(3001, 65535),
  JWT_SECRET: z.string().min(32),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .refine(
      (values) =>
        values.every((value) => {
          const [address, prefix, extra] = value.split('/');
          const family = isIP(address);
          return (
            !!family &&
            extra === undefined &&
            (prefix === undefined ||
              (/^\d+$/.test(prefix) &&
                Number(prefix) >= 1 &&
                Number(prefix) <= (family === 4 ? 32 : 128)))
          );
        }),
      'Expected explicit trusted proxy IP addresses or CIDRs; universal trust is forbidden',
    ),
  PUBLIC_API_URL: z
    .string()
    .default('http://localhost:3001')
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) && url.origin === value
        );
      } catch {
        return false;
      }
    }, 'Expected an HTTP origin without credentials or path'),
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .refine(
      (origins) =>
        origins.length > 0 &&
        origins.every((origin) => {
          try {
            const url = new URL(origin);
            return (
              ['http:', 'https:'].includes(url.protocol) &&
              url.origin === origin
            );
          } catch {
            return false;
          }
        }),
      'Expected comma-separated HTTP origins without paths',
    ),

  DATABASE_URL: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        !!url.hostname &&
        !!url.username &&
        !!url.password &&
        url.pathname.length > 1
      );
    } catch {
      return false;
    }
  }, 'Expected a PostgreSQL URL with credentials and database name'),
  DATABASE_POOL_SIZE: integer(10, 100),
  DATABASE_CONNECTION_TIMEOUT_MS: integer(
    5 * TIME.ONE_SECOND.IN_MS,
    TIME.ONE_MINUTE.IN_MS,
  ),
  DATABASE_QUERY_TIMEOUT_MS: integer(
    5 * TIME.ONE_SECOND.IN_MS,
    TIME.ONE_MINUTE.IN_MS,
  ),
  DATABASE_IDLE_TIMEOUT_MS: integer(
    30 * TIME.ONE_SECOND.IN_MS,
    10 * TIME.ONE_MINUTE.IN_MS,
  ),
  REDIS_HOST: z.string().trim().min(1).default('localhost'),
  REDIS_PORT: integer(6379, 65535),
  REDIS_PASSWORD: z.string().min(1),
  REDIS_TLS: z
    .union([
      z.boolean(),
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ])
    .default(false),
  REDIS_CONNECT_TIMEOUT_MS: integer(
    5 * TIME.ONE_SECOND.IN_MS,
    TIME.ONE_MINUTE.IN_MS,
  ),
  REDIS_COMMAND_TIMEOUT_MS: integer(
    5 * TIME.ONE_SECOND.IN_MS,
    TIME.ONE_MINUTE.IN_MS,
  ),
});

export type ConfigSchema = z.infer<typeof configSchema>;

export function validateConfig(input: Record<string, unknown>): ConfigSchema {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    // Report only field names, never input values, URLs or secrets.
    throw new Error(
      `Invalid configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  return {
    ...result.data,
    TRUSTED_ORIGINS: [
      ...new Set([...result.data.TRUSTED_ORIGINS, result.data.PUBLIC_API_URL]),
    ],
  };
}
