import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

export const roleSelect = {
  id: true,
  name: true,
  description: true,
} satisfies Prisma.OrganizationRoleSelect;
export const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

export type OrganizationContext = Awaited<
  ReturnType<OrganizationAccessService['context']>
>;

@Injectable()
export class OrganizationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async context(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ) {
    const membership = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        userId: true,
        role: { select: roleSelect },
        organization: { select: organizationSelect },
      },
    });
    if (!membership) throw new NotFoundException('Организация не найдена');
    const actor = {
      userId,
      role: membership.role,
      isOwner: membership.organization.ownerUserId === userId,
    };
    return { actor, organization: membership.organization };
  }

  async read<T>(
    organizationId: string,
    userId: string,
    operation: (
      tx: Prisma.TransactionClient,
      context: OrganizationContext,
    ) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) =>
        operation(tx, await this.context(tx, organizationId, userId)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async mutate<T>(
    organizationId: string,
    userId: string,
    operation: (
      tx: Prisma.TransactionClient,
      context: OrganizationContext,
    ) => Promise<T>,
  ) {
    return this.locked(organizationId, async (tx) =>
      operation(tx, await this.context(tx, organizationId, userId)),
    );
  }

  async locked<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // All organization writers take this lock before reading authorization.
          // READ COMMITTED sees the latest owner/role after a concurrent writer commits.
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT "id" FROM "app"."Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
          if (!rows.length)
            throw new NotFoundException('Организация не найдена');
          return operation(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('Такое значение уже используется');
      if (['P2003', 'P2014'].includes(error.code))
        throw new ConflictException('Запись используется связанными данными');
      if (error.code === 'P2025')
        throw new NotFoundException('Запись не найдена');
      if (['P2034', 'P2028'].includes(error.code))
        throw new ConflictException('Конкурентное изменение. Повторите запрос');
    }
    throw error;
  }
}
