import type { User } from '../../generated/prisma/client.js';

export const Role = { USER: 'USER', ADMIN: 'ADMIN' } as const;
export type Role = User['role'];
