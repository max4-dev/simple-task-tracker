BEGIN;

ALTER TABLE "app"."OrganizationInvitation" ADD COLUMN "roleName" TEXT;
UPDATE "app"."OrganizationInvitation" i
SET "roleName" = r."name"
FROM "app"."OrganizationRole" r
WHERE r."organizationId" = i."organizationId" AND r."id" = i."roleId";
ALTER TABLE "app"."OrganizationInvitation"
  ALTER COLUMN "roleName" SET NOT NULL,
  ALTER COLUMN "roleId" DROP NOT NULL,
  ADD CONSTRAINT "OrganizationInvitation_active_role"
    CHECK ("roleId" IS NOT NULL OR "acceptedAt" IS NOT NULL OR "revokedAt" IS NOT NULL);

COMMIT;
