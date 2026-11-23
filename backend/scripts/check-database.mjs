import assert from 'node:assert/strict';
import { Client } from 'pg';

export async function checkDatabase(url) {
  if (!url) throw new Error('DATABASE_URL is required');
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    const {
      rows: [role],
    } = await client.query(
      "SELECT current_user AS name, has_schema_privilege(current_user, 'app', 'USAGE') AS usage, has_schema_privilege(current_user, 'app', 'CREATE') AS create_schema, has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage",
    );
    assert.equal(role.name, 'task_tracker_app');
    assert.equal(role.usage, true);
    assert.equal(role.create_schema, false);
    assert.equal(role.public_usage, false);
    await client.query('SELECT 1 FROM "app"."User" LIMIT 1');
    await client.query(
      'SELECT "roleName" FROM "app"."OrganizationInvitation" LIMIT 1',
    );
    console.log(
      'PASS: runtime database connection and restricted schema privileges',
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await checkDatabase(process.env.DATABASE_URL);
  } catch {
    console.error(
      'Database check failed; check connectivity, migrations and runtime privileges.',
    );
    process.exitCode = 1;
  }
}
