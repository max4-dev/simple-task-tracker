CREATE TYPE "app"."TaskEventKind" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNMENTS_CHANGED', 'ARCHIVED', 'RESTORED', 'STATUS_REPLACED', 'MEMBER_REMOVED');

ALTER TABLE "app"."Task" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_revision_positive" CHECK ("revision" > 0);

CREATE TABLE "app"."TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT,
    "kind" "app"."TaskEventKind" NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskEvent_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "TaskEvent_changes_object" CHECK (jsonb_typeof("changes") = 'object')
);
CREATE UNIQUE INDEX "TaskEvent_taskId_revision_key" ON "app"."TaskEvent"("taskId", "revision");
CREATE INDEX "TaskEvent_actorId_idx" ON "app"."TaskEvent"("actorId");
ALTER TABLE "app"."TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "app"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."TaskEvent" ADD CONSTRAINT "TaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing tasks start at revision 1; historical activity is not fabricated.
