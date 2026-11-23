ALTER TABLE "app"."Notification" ADD COLUMN "sourceKey" TEXT;
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "app"."Notification"("sourceKey");
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "app"."Notification"("recipientId", "createdAt", "id");
CREATE TABLE "app"."NotificationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceKey" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "taskId" TEXT NOT NULL,
  "kind" "app"."NotificationKind" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "processedAt" TIMESTAMPTZ(3),
  "lastError" TEXT
);
CREATE UNIQUE INDEX "NotificationJob_sourceKey_key" ON "app"."NotificationJob"("sourceKey");
CREATE INDEX "NotificationJob_processedAt_availableAt_id_idx" ON "app"."NotificationJob"("processedAt", "availableAt", "id");
CREATE FUNCTION "app"."enqueue_task_notifications"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind NOT IN ('CREATED', 'ASSIGNMENTS_CHANGED') THEN RETURN NEW; END IF;
  INSERT INTO "app"."NotificationJob" (id,"sourceKey","recipientId","actorId","taskId",kind,title,body,"createdAt")
  SELECT gen_random_uuid()::text, NEW.id || ':' || a.user_id || ':' || a.kind,
    a.user_id, NEW."actorId", NEW."taskId", a.kind::"app"."NotificationKind",
    p."taskPrefix" || '-' || t.number || ': ' || t.title,
    COALESCE(u.name,'Участник') || CASE WHEN a.kind='TASK_REVIEW_REQUESTED' THEN ' назначил вас на ревью' ELSE ' назначил вас на задачу' END,
    NEW."createdAt"
  FROM (
    SELECT DISTINCT item->>'userId' AS user_id,
      CASE WHEN item->>'kind'='REVIEWER' THEN 'TASK_REVIEW_REQUESTED' ELSE 'TASK_ASSIGNED' END AS kind
    FROM jsonb_array_elements(COALESCE(CASE WHEN NEW.kind='CREATED' THEN NEW.changes->'assignments' ELSE NEW.changes->'added' END,'[]'::jsonb)) item
    WHERE item->>'kind' IN ('ASSIGNEE','RESPONSIBLE','REVIEWER')
      AND item->>'userId' IS DISTINCT FROM NEW."actorId"
  ) a
  JOIN "app"."Task" t ON t.id=NEW."taskId"
  JOIN "app"."Project" p ON p.id=t."projectId"
  JOIN "app"."ProjectMember" m ON m."projectId"=p.id AND m."userId"=a.user_id
  LEFT JOIN "app"."User" u ON u.id=NEW."actorId"
  ON CONFLICT ("sourceKey") DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER "TaskEvent_notify" AFTER INSERT ON "app"."TaskEvent" FOR EACH ROW EXECUTE FUNCTION "app"."enqueue_task_notifications"();
-- No historical backfill: old assignments do not generate surprise notifications.

CREATE INDEX "Notification_createdAt_id_idx" ON "app"."Notification"("createdAt", "id");
CREATE INDEX "NotificationJob_createdAt_id_idx" ON "app"."NotificationJob"("createdAt", "id");
