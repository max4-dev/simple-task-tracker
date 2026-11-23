ALTER TYPE "app"."TaskEventKind" ADD VALUE 'MOVED';
ALTER TABLE "app"."Project" ADD COLUMN "boardRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "app"."Project" ADD CONSTRAINT "Project_boardRevision_positive" CHECK ("boardRevision" > 0);

-- Preserve the previous deterministic position+id order, including legacy ties.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "projectId", "statusId" ORDER BY "position", "id") * 1024 AS position
  FROM "app"."Task"
)
UPDATE "app"."Task" t SET "position" = r.position FROM ranked r WHERE t."id" = r."id";
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_position_finite" CHECK ("position" <> 'NaN'::numeric);
DROP INDEX "app"."Task_projectId_statusId_archivedAt_position_idx";
CREATE INDEX "Task_projectId_statusId_archivedAt_position_id_idx" ON "app"."Task"("projectId", "statusId", "archivedAt", "position", "id");

-- Transition tables bump once per affected project per statement, not per card.
-- These are invoker functions; runtime remains unable to change schema or bypass grants.
CREATE FUNCTION "app"."invalidate_board_rows"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE project_id text;
BEGIN
  FOR project_id IN SELECT DISTINCT "projectId" FROM board_rows ORDER BY "projectId" LOOP
    UPDATE "app"."Project" SET "boardRevision" = "boardRevision" + 1 WHERE "id" = project_id;
  END LOOP;
  RETURN NULL;
END; $$;
CREATE FUNCTION "app"."invalidate_board_update"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE project_id text;
BEGIN
  FOR project_id IN SELECT "projectId" FROM board_old UNION SELECT "projectId" FROM board_new ORDER BY "projectId" LOOP
    UPDATE "app"."Project" SET "boardRevision" = "boardRevision" + 1 WHERE "id" = project_id;
  END LOOP;
  RETURN NULL;
END; $$;
CREATE TRIGGER "Task_board_insert" AFTER INSERT ON "app"."Task" REFERENCING NEW TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "Task_board_delete" AFTER DELETE ON "app"."Task" REFERENCING OLD TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "Task_board_update" AFTER UPDATE ON "app"."Task" REFERENCING OLD TABLE AS board_old NEW TABLE AS board_new FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_update"();
CREATE TRIGGER "TaskAssignment_board_insert" AFTER INSERT ON "app"."TaskAssignment" REFERENCING NEW TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "TaskAssignment_board_delete" AFTER DELETE ON "app"."TaskAssignment" REFERENCING OLD TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "TaskAssignment_board_update" AFTER UPDATE ON "app"."TaskAssignment" REFERENCING OLD TABLE AS board_old NEW TABLE AS board_new FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_update"();
CREATE TRIGGER "TaskStatus_board_insert" AFTER INSERT ON "app"."TaskStatus" REFERENCING NEW TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "TaskStatus_board_delete" AFTER DELETE ON "app"."TaskStatus" REFERENCING OLD TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "TaskStatus_board_update" AFTER UPDATE ON "app"."TaskStatus" REFERENCING OLD TABLE AS board_old NEW TABLE AS board_new FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_update"();
CREATE TRIGGER "TaskTag_board_insert" AFTER INSERT ON "app"."TaskTag" REFERENCING NEW TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "TaskTag_board_delete" AFTER DELETE ON "app"."TaskTag" REFERENCING OLD TABLE AS board_rows FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_rows"();
CREATE TRIGGER "TaskTag_board_update" AFTER UPDATE ON "app"."TaskTag" REFERENCING OLD TABLE AS board_old NEW TABLE AS board_new FOR EACH STATEMENT EXECUTE FUNCTION "app"."invalidate_board_update"();
