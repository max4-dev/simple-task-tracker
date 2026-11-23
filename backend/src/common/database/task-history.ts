import { Prisma } from '../../generated/prisma/client.js';

// Caller holds exclusive organization lock OR shared organization + exclusive project lock.
// One event/revision per affected task, including tasks in archived projects.
export async function removeMemberTaskAssignments(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  actorId: string,
  projectId?: string,
) {
  await tx.$executeRaw`
    WITH removed AS (
      DELETE FROM "app"."TaskAssignment" a
      USING "app"."Project" p
      WHERE a."projectId" = p."id" AND p."organizationId" = ${organizationId}
        AND a."userId" = ${userId}
        ${projectId ? Prisma.sql`AND p."id" = ${projectId}` : Prisma.empty}
      RETURNING a."taskId", a."userId", a."kind"
    ), grouped AS (
      SELECT "taskId", jsonb_agg(jsonb_build_object('userId', "userId", 'kind', "kind") ORDER BY "kind") AS assignments
      FROM removed GROUP BY "taskId"
    ), changed AS (
      UPDATE "app"."Task" t SET "revision" = t."revision" + 1, "updatedAt" = clock_timestamp()
      FROM grouped g WHERE t."id" = g."taskId"
      RETURNING t."id", t."revision", g.assignments
    )
    INSERT INTO "app"."TaskEvent" ("id", "taskId", "revision", "actorId", "kind", "changes")
    SELECT gen_random_uuid()::text, "id", "revision", ${actorId}, 'MEMBER_REMOVED'::"app"."TaskEventKind",
      jsonb_build_object('removed', assignments) FROM changed
  `;
}

// Bulk status deletion must also invalidate open task editors; no unbounded JS loop.
export async function replaceTaskStatus(
  tx: Prisma.TransactionClient,
  projectId: string,
  statusId: string,
  replacementStatusId: string,
  actorId: string,
) {
  await tx.$executeRaw`
    WITH ordered AS (
      SELECT "id", "statusId" = ${statusId} AS was_source,
        row_number() OVER (ORDER BY ("statusId" = ${statusId}), "position", "id") * 1024 AS position
      FROM "app"."Task" WHERE "projectId" = ${projectId} AND "statusId" IN (${statusId}, ${replacementStatusId})
    ), changed AS (
      UPDATE "app"."Task" t SET "statusId" = ${replacementStatusId}, "position" = o.position,
        "revision" = t."revision" + CASE WHEN o.was_source THEN 1 ELSE 0 END,
        "updatedAt" = CASE WHEN o.was_source THEN clock_timestamp() ELSE t."updatedAt" END
      FROM ordered o WHERE t."id" = o."id"
      RETURNING t."id", t."revision", o.was_source
    )
    INSERT INTO "app"."TaskEvent" ("id", "taskId", "revision", "actorId", "kind", "changes")
    SELECT gen_random_uuid()::text, "id", "revision", ${actorId}, 'STATUS_REPLACED'::"app"."TaskEventKind",
      jsonb_build_object('fromStatusId', ${statusId}::text, 'toStatusId', ${replacementStatusId}::text) FROM changed WHERE was_source
  `;
}
