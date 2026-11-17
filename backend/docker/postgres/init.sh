#!/bin/bash
set -Eeuo pipefail

# The official entrypoint runs this only when initializing an empty volume.
# psql quotes values and identifiers; credentials are never interpolated as SQL.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=db="$POSTGRES_DB" \
  --set=migration_password="$POSTGRES_MIGRATION_PASSWORD" \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE task_tracker_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'migration_password';
CREATE ROLE task_tracker_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';

ALTER DATABASE :"db" OWNER TO task_tracker_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO task_tracker_app;

ALTER SCHEMA public OWNER TO task_tracker_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA app AUTHORIZATION task_tracker_migrator;
GRANT USAGE ON SCHEMA app TO task_tracker_app;
ALTER DEFAULT PRIVILEGES FOR ROLE task_tracker_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO task_tracker_app;
ALTER DEFAULT PRIVILEGES FOR ROLE task_tracker_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO task_tracker_app;
SQL
