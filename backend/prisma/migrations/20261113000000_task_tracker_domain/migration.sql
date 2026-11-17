BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."OrganizationPermission" AS ENUM ('EDIT_ORGANIZATION', 'MANAGE_MEMBERS', 'MANAGE_ROLES', 'MANAGE_INVITATIONS', 'CREATE_PROJECTS');

-- CreateEnum
CREATE TYPE "app"."ProjectPermission" AS ENUM ('VIEW_PROJECT', 'EDIT_PROJECT', 'DELETE_PROJECT', 'MANAGE_MEMBERS', 'MANAGE_ROLES', 'MANAGE_STATUSES', 'MANAGE_TAGS', 'MANAGE_REPOSITORIES', 'CREATE_TASKS', 'EDIT_TASKS', 'DELETE_TASKS', 'ASSIGN_TASKS');

-- CreateEnum
CREATE TYPE "app"."TaskStatusCategory" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "app"."TaskAssignmentKind" AS ENUM ('RESPONSIBLE', 'ASSIGNEE', 'REVIEWER');

-- CreateEnum
CREATE TYPE "app"."NotificationKind" AS ENUM ('TASK_ASSIGNED', 'TASK_REVIEW_REQUESTED', 'ORGANIZATION_INVITED', 'PROJECT_ADDED');

-- CreateEnum
CREATE TYPE "app"."EmailDeliveryStatus" AS ENUM ('DISABLED', 'PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "app"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "avatarUrl" TEXT,
    "phone" TEXT,
    "bio" TEXT,
    "githubUrl" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."UserSocialLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."UserWorkInterval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "UserWorkInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."OrganizationRole" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationPermissions" "app"."OrganizationPermission"[] DEFAULT ARRAY[]::"app"."OrganizationPermission"[],
    "projectPermissions" "app"."ProjectPermission"[] DEFAULT ARRAY[]::"app"."ProjectPermission"[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "app"."Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "taskPrefix" TEXT NOT NULL,
    "lastTaskNumber" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ProjectRoleOverride" (
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "allowPermissions" "app"."ProjectPermission"[] DEFAULT ARRAY[]::"app"."ProjectPermission"[],
    "denyPermissions" "app"."ProjectPermission"[] DEFAULT ARRAY[]::"app"."ProjectPermission"[],

    CONSTRAINT "ProjectRoleOverride_pkey" PRIMARY KEY ("projectId","roleId")
);

-- CreateTable
CREATE TABLE "app"."ProjectMember" (
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "allowPermissions" "app"."ProjectPermission"[] DEFAULT ARRAY[]::"app"."ProjectPermission"[],
    "denyPermissions" "app"."ProjectPermission"[] DEFAULT ARRAY[]::"app"."ProjectPermission"[],
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "app"."TaskStatus" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "category" "app"."TaskStatusCategory" NOT NULL DEFAULT 'TODO',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TaskTag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchPrefix" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',

    CONSTRAINT "TaskTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "statusId" TEXT NOT NULL,
    "tagId" TEXT,
    "creatorId" TEXT,
    "previewUrl" TEXT,
    "position" DECIMAL(30,15) NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TaskAssignment" (
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "app"."TaskAssignmentKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId","userId","kind")
);

-- CreateTable
CREATE TABLE "app"."TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ProjectRepository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "githubRepositoryId" BIGINT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',

    CONSTRAINT "ProjectRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."TaskBranch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TaskBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedById" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "taskId" TEXT,
    "invitationId" TEXT,
    "kind" "app"."NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "emailStatus" "app"."EmailDeliveryStatus" NOT NULL DEFAULT 'DISABLED',
    "emailedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "app"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSocialLink_userId_url_key" ON "app"."UserSocialLink"("userId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "UserWorkInterval_userId_weekday_startMinute_key" ON "app"."UserWorkInterval"("userId", "weekday", "startMinute");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "app"."Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_id_ownerUserId_key" ON "app"."Organization"("id", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRole_organizationId_name_key" ON "app"."OrganizationRole"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRole_organizationId_id_key" ON "app"."OrganizationRole"("organizationId", "id");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "app"."OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_roleId_idx" ON "app"."OrganizationMember"("organizationId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "app"."Project"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_taskPrefix_key" ON "app"."Project"("organizationId", "taskPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_id_key" ON "app"."Project"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProjectRoleOverride_organizationId_roleId_idx" ON "app"."ProjectRoleOverride"("organizationId", "roleId");

-- CreateIndex
CREATE INDEX "ProjectMember_organizationId_userId_idx" ON "app"."ProjectMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ProjectMember_organizationId_roleId_idx" ON "app"."ProjectMember"("organizationId", "roleId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "app"."ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "TaskStatus_projectId_position_idx" ON "app"."TaskStatus"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatus_projectId_id_key" ON "app"."TaskStatus"("projectId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatus_projectId_name_key" ON "app"."TaskStatus"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_projectId_id_key" ON "app"."TaskTag"("projectId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_projectId_name_key" ON "app"."TaskTag"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_projectId_branchPrefix_key" ON "app"."TaskTag"("projectId", "branchPrefix");

-- CreateIndex
CREATE INDEX "Task_projectId_statusId_archivedAt_position_idx" ON "app"."Task"("projectId", "statusId", "archivedAt", "position");

-- CreateIndex
CREATE INDEX "Task_projectId_tagId_idx" ON "app"."Task"("projectId", "tagId");

-- CreateIndex
CREATE INDEX "Task_creatorId_idx" ON "app"."Task"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_number_key" ON "app"."Task"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_id_key" ON "app"."Task"("projectId", "id");

-- CreateIndex
CREATE INDEX "TaskAssignment_projectId_userId_idx" ON "app"."TaskAssignment"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_storageKey_key" ON "app"."TaskAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "app"."TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploadedById_idx" ON "app"."TaskAttachment"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepository_projectId_url_key" ON "app"."ProjectRepository"("projectId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepository_projectId_id_key" ON "app"."ProjectRepository"("projectId", "id");

-- CreateIndex
CREATE INDEX "TaskBranch_projectId_taskId_idx" ON "app"."TaskBranch"("projectId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskBranch_repositoryId_name_key" ON "app"."TaskBranch"("repositoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "app"."OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_roleId_idx" ON "app"."OrganizationInvitation"("organizationId", "roleId");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_expiresAt_idx" ON "app"."OrganizationInvitation"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_invitedById_idx" ON "app"."OrganizationInvitation"("invitedById");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_acceptedById_idx" ON "app"."OrganizationInvitation"("acceptedById");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "app"."Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "app"."Notification"("actorId");

-- CreateIndex
CREATE INDEX "Notification_taskId_idx" ON "app"."Notification"("taskId");

-- CreateIndex
CREATE INDEX "Notification_invitationId_idx" ON "app"."Notification"("invitationId");

-- CreateIndex
CREATE INDEX "Notification_emailStatus_createdAt_idx" ON "app"."Notification"("emailStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "app"."UserSocialLink" ADD CONSTRAINT "UserSocialLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."UserWorkInterval" ADD CONSTRAINT "UserWorkInterval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Organization" ADD CONSTRAINT "Organization_id_ownerUserId_fkey" FOREIGN KEY ("id", "ownerUserId") REFERENCES "app"."OrganizationMember"("organizationId", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."OrganizationRole" ADD CONSTRAINT "OrganizationRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "app"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "app"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "app"."OrganizationRole"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "app"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectRoleOverride" ADD CONSTRAINT "ProjectRoleOverride_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "app"."Project"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectRoleOverride" ADD CONSTRAINT "ProjectRoleOverride_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "app"."OrganizationRole"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "app"."Project"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "app"."OrganizationMember"("organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "app"."OrganizationRole"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."TaskStatus" ADD CONSTRAINT "TaskStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskTag" ADD CONSTRAINT "TaskTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_projectId_statusId_fkey" FOREIGN KEY ("projectId", "statusId") REFERENCES "app"."TaskStatus"("projectId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_projectId_tagId_fkey" FOREIGN KEY ("projectId", "tagId") REFERENCES "app"."TaskTag"("projectId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_projectId_taskId_fkey" FOREIGN KEY ("projectId", "taskId") REFERENCES "app"."Task"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "app"."ProjectMember"("projectId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "app"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectRepository" ADD CONSTRAINT "ProjectRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskBranch" ADD CONSTRAINT "TaskBranch_projectId_taskId_fkey" FOREIGN KEY ("projectId", "taskId") REFERENCES "app"."Task"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."TaskBranch" ADD CONSTRAINT "TaskBranch_projectId_repositoryId_fkey" FOREIGN KEY ("projectId", "repositoryId") REFERENCES "app"."ProjectRepository"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "app"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "app"."OrganizationRole"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app"."OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "app"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Notification" ADD CONSTRAINT "Notification_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "app"."OrganizationInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariants not expressible in Prisma. Keep this block when reviewing future migrations.
-- Creation inserts Organization + its owner membership in one transaction.
ALTER TABLE "app"."Organization"
  ALTER CONSTRAINT "Organization_id_ownerUserId_fkey" DEFERRABLE INITIALLY DEFERRED;

-- Cross-links inside an aggregate are checked after all cascades / reassignments finish.
-- This preserves role/status/tag protection without blocking deletion of the whole organization.
ALTER TABLE "app"."OrganizationMember"
  ALTER CONSTRAINT "OrganizationMember_organizationId_roleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "app"."ProjectMember"
  ALTER CONSTRAINT "ProjectMember_organizationId_roleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "app"."ProjectRoleOverride"
  ALTER CONSTRAINT "ProjectRoleOverride_organizationId_roleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "app"."OrganizationInvitation"
  ALTER CONSTRAINT "OrganizationInvitation_organizationId_roleId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "app"."Task"
  ALTER CONSTRAINT "Task_projectId_statusId_fkey" DEFERRABLE INITIALLY DEFERRED,
  ALTER CONSTRAINT "Task_projectId_tagId_fkey" DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "app"."User"
  ADD CONSTRAINT "User_tokenVersion_nonnegative" CHECK ("tokenVersion" >= 0);

-- Email addresses are compared case-insensitively, including concurrent registrations.
CREATE UNIQUE INDEX "User_email_case_insensitive_key" ON "app"."User" (lower(btrim("email")));

ALTER TABLE "app"."UserWorkInterval"
  ADD CONSTRAINT "UserWorkInterval_bounds" CHECK (
    "weekday" BETWEEN 1 AND 7 AND "startMinute" >= 0
    AND "startMinute" < "endMinute" AND "endMinute" <= 1440
  );

ALTER TABLE "app"."OrganizationRole"
  ALTER COLUMN "organizationPermissions" SET NOT NULL,
  ALTER COLUMN "projectPermissions" SET NOT NULL,
  ADD CONSTRAINT "OrganizationRole_reserved_owner" CHECK (
    length(btrim("name")) > 0 AND lower(btrim("name")) <> 'owner'
  );

ALTER TABLE "app"."ProjectRoleOverride"
  ALTER COLUMN "allowPermissions" SET NOT NULL,
  ALTER COLUMN "denyPermissions" SET NOT NULL,
  ADD CONSTRAINT "ProjectRoleOverride_disjoint_permissions"
    CHECK (NOT ("allowPermissions" && "denyPermissions"));

ALTER TABLE "app"."ProjectMember"
  ALTER COLUMN "allowPermissions" SET NOT NULL,
  ALTER COLUMN "denyPermissions" SET NOT NULL,
  ADD CONSTRAINT "ProjectMember_disjoint_permissions"
    CHECK (NOT ("allowPermissions" && "denyPermissions"));

ALTER TABLE "app"."Project"
  ADD CONSTRAINT "Project_taskPrefix_format" CHECK ("taskPrefix" ~ '^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$'),
  ADD CONSTRAINT "Project_taskCounter_nonnegative" CHECK ("lastTaskNumber" >= 0);

ALTER TABLE "app"."TaskTag"
  ADD CONSTRAINT "TaskTag_branchPrefix_format" CHECK ("branchPrefix" ~ '^[a-z][a-z0-9-]*$');

ALTER TABLE "app"."Task"
  ADD CONSTRAINT "Task_number_positive" CHECK ("number" > 0),
  ADD CONSTRAINT "Task_title_not_empty" CHECK (length(btrim("title")) > 0);

ALTER TABLE "app"."TaskAttachment"
  ADD CONSTRAINT "TaskAttachment_size_nonnegative" CHECK ("sizeBytes" >= 0);

ALTER TABLE "app"."OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_lifetime" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "OrganizationInvitation_terminal_state" CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL);

-- Expired invites must be revoked/reissued explicitly; now() cannot be an index predicate.
CREATE UNIQUE INDEX "OrganizationInvitation_pending_email_key"
  ON "app"."OrganizationInvitation" ("organizationId", lower(btrim("email")))
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "app"."Notification"
  ADD CONSTRAINT "Notification_email_delivery_state"
    CHECK (("emailStatus" = 'SENT') = ("emailedAt" IS NOT NULL));

CREATE FUNCTION "app"."allocate_task_number"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, app AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Row locking serializes concurrent inserts into the same project.
    UPDATE "app"."Project"
       SET "lastTaskNumber" = "lastTaskNumber" + 1
     WHERE "id" = NEW."projectId"
     RETURNING "lastTaskNumber" INTO NEW."number";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Task project does not exist' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW."projectId" IS DISTINCT FROM OLD."projectId"
     OR NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'Task project and number are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Task_allocate_number"
BEFORE INSERT OR UPDATE OF "projectId", "number" ON "app"."Task"
FOR EACH ROW EXECUTE FUNCTION "app"."allocate_task_number"();

CREATE FUNCTION "app"."protect_project_task_counter"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, app AS $$
BEGIN
  IF NEW."lastTaskNumber" < OLD."lastTaskNumber" THEN
    RAISE EXCEPTION 'Task counter cannot decrease' USING ERRCODE = '23514';
  END IF;
  IF OLD."lastTaskNumber" > 0 AND NEW."taskPrefix" IS DISTINCT FROM OLD."taskPrefix" THEN
    RAISE EXCEPTION 'Task prefix cannot change after issuing tasks' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Project_protect_task_identity"
BEFORE UPDATE OF "taskPrefix", "lastTaskNumber" ON "app"."Project"
FOR EACH ROW EXECUTE FUNCTION "app"."protect_project_task_counter"();

COMMIT;

