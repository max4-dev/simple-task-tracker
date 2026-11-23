import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  cp,
  writeFile,
  rm,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { checkDatabase } from './check-database.mjs';
import { checkHttpScenarios } from './check-http-scenarios.mjs';

// Own disposable containers only; never reads .env or uses a Compose volume.
const root = resolve(new URL('..', import.meta.url).pathname);
const suffix = randomUUID().replaceAll('-', '');
const pgName = 'tt-check-pg-' + suffix;
const redisName = 'tt-check-redis-' + suffix;
const networkName = 'tt-check-net-' + suffix;
const apiName = 'tt-check-api-' + suffix;
const created = [];
let networkCreated = false;
const credentials = {
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  POSTGRES_MIGRATION_PASSWORD: randomBytes(24).toString('hex'),
  POSTGRES_APP_PASSWORD: randomBytes(24).toString('hex'),
  REDIS_PASSWORD: randomBytes(24).toString('hex'),
};
let phase = 'start';
let temp;
let migrator;
const run = (binary, args, env = {}) => {
  try {
    return execFileSync(binary, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    })
      .toString()
      .trim();
  } catch {
    throw new Error('Command failed during ' + phase);
  }
};
const docker = (...args) => run('docker', args, credentials);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(check) {
  for (let i = 0; i < 60; i++) {
    try {
      await check();
      return;
    } catch {
      await wait(500);
    }
  }
  throw new Error('Service readiness timed out');
}

try {
  const compose = await readFile(resolve(root, 'compose.yaml'), 'utf8');
  const postgresImage = compose.match(/image: (postgres:\S+)/)[1];
  const redisImage = compose.match(/image: (redis:\S+)/)[1];
  phase =
    'local Docker images (pull Compose postgres/redis images first if missing)';
  docker('image', 'inspect', postgresImage);
  docker('image', 'inspect', redisImage);
  phase = 'isolated PostgreSQL/Redis startup';
  docker('network', 'create', networkName);
  networkCreated = true;
  docker(
    'run',
    '-d',
    '--name',
    pgName,
    '--network',
    networkName,
    '--network-alias',
    'postgres',
    '--tmpfs',
    '/var/lib/postgresql',
    '-p',
    '127.0.0.1::5432',
    '-e',
    'POSTGRES_DB=task_tracker',
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_PASSWORD',
    '-e',
    'POSTGRES_MIGRATION_PASSWORD',
    '-e',
    'POSTGRES_APP_PASSWORD',
    '-v',
    resolve(root, 'docker/postgres/init.sh') +
      ':/docker-entrypoint-initdb.d/10-roles.sh:ro',
    postgresImage,
  );
  created.push(pgName);
  docker(
    'run',
    '-d',
    '--name',
    redisName,
    '--network',
    networkName,
    '--network-alias',
    'redis',
    '--tmpfs',
    '/data',
    '-p',
    '127.0.0.1::6379',
    '-e',
    'REDIS_PASSWORD',
    redisImage,
    'sh',
    '-c',
    'exec redis-server --requirepass "$REDIS_PASSWORD" --save "" --appendonly no',
  );
  created.push(redisName);
  await ready(() =>
    docker(
      'exec',
      pgName,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      'task_tracker',
    ),
  );
  await ready(() =>
    docker(
      'exec',
      redisName,
      'sh',
      '-c',
      'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping',
    ),
  );
  const pgPort = Number(docker('port', pgName, '5432/tcp').split(':').at(-1));
  const redisPort = Number(
    docker('port', redisName, '6379/tcp').split(':').at(-1),
  );
  const migrationUrl = `postgresql://task_tracker_migrator:${credentials.POSTGRES_MIGRATION_PASSWORD}@127.0.0.1:${pgPort}/task_tracker?schema=public`;
  const runtimeUrl = `postgresql://task_tracker_app:${credentials.POSTGRES_APP_PASSWORD}@127.0.0.1:${pgPort}/task_tracker`;
  const migrate = (...args) =>
    run(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
      MIGRATION_DATABASE_URL: migrationUrl,
    });
  phase = 'migration upgrade from previous schema with existing invitation';
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  temp = await mkdtemp(resolve(root, '.tmp/domain-'));
  await mkdir(resolve(temp, 'migrations'));
  for (const name of await readdir(resolve(root, 'prisma/migrations'))) {
    if (name < '20261119000000' || name === 'migration_lock.toml')
      await cp(
        resolve(root, 'prisma/migrations', name),
        resolve(temp, 'migrations', name),
        { recursive: true },
      );
  }
  await writeFile(
    resolve(temp, 'prisma.config.ts'),
    `import { defineConfig } from 'prisma/config'; export default defineConfig({schema:${JSON.stringify(resolve(root, 'prisma/schema.prisma'))}, migrations:{path:${JSON.stringify(resolve(temp, 'migrations'))}}, datasource:{url:process.env.MIGRATION_DATABASE_URL}});`,
  );
  migrate('migrate', 'deploy', '--config', resolve(temp, 'prisma.config.ts'));
  migrator = new Client({ connectionString: migrationUrl });
  await migrator.connect();
  const [user, org, role, invite] = Array.from({ length: 4 }, () =>
    randomUUID(),
  );
  await migrator.query('BEGIN');
  await migrator.query(
    'INSERT INTO app."User" (id,email,name,password,"updatedAt") VALUES ($1,$2,$3,$4,now())',
    [user, 'upgrade@example.test', 'Upgrade', 'disabled-fixture-password'],
  );
  await migrator.query(
    'INSERT INTO app."Organization" (id,name,slug,"ownerUserId","updatedAt") VALUES ($1,$2,$3,$4,now())',
    [org, 'Upgrade', 'upgrade', user],
  );
  await migrator.query(
    'INSERT INTO app."OrganizationMember" ("organizationId","userId") VALUES ($1,$2)',
    [org, user],
  );
  await migrator.query(
    'INSERT INTO app."OrganizationRole" (id,"organizationId",name,"updatedAt") VALUES ($1,$2,$3,now())',
    [role, org, 'Legacy designer'],
  );
  await migrator.query(
    'INSERT INTO app."OrganizationInvitation" (id,"organizationId",email,"roleId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,$5,now()+interval \'1 day\')',
    [invite, org, 'invite@example.test', role, randomBytes(32).toString('hex')],
  );
  const [legacyProject, legacyStatus, legacyTask] = Array.from(
    { length: 3 },
    () => randomUUID(),
  );
  await migrator.query(
    'INSERT INTO app."Project" (id,"organizationId",name,slug,"taskPrefix","updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
    [legacyProject, org, 'Legacy', 'legacy', 'LEG'],
  );
  await migrator.query(
    'INSERT INTO app."TaskStatus" (id,"projectId",name) VALUES ($1,$2,$3)',
    [legacyStatus, legacyProject, 'Legacy'],
  );
  await migrator.query(
    'INSERT INTO app."Task" (id,"projectId",title,"statusId","updatedAt") VALUES ($1,$2,$3,$4,now())',
    [legacyTask, legacyProject, 'Existing task', legacyStatus],
  );
  const legacyTie = randomUUID();
  await migrator.query(
    'INSERT INTO app."Task" (id,"projectId",title,"statusId","updatedAt") VALUES ($1,$2,$3,$4,now())',
    [legacyTie, legacyProject, 'Existing tied task', legacyStatus],
  );
  await migrator.query('COMMIT');
  migrate('migrate', 'deploy');
  migrate('migrate', 'deploy');
  assert.deepEqual(
    (
      await migrator.query(
        'SELECT number, revision, title FROM app."Task" WHERE id=$1',
        [legacyTask],
      )
    ).rows[0],
    { number: 1, revision: 1, title: 'Existing task' },
  );
  assert.equal(
    (
      await migrator.query(
        'SELECT count(*)::int AS count FROM app."TaskEvent" WHERE "taskId"=$1',
        [legacyTask],
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await migrator.query(
        'SELECT "roleName" FROM app."OrganizationInvitation" WHERE id=$1',
        [invite],
      )
    ).rows[0].roleName,
    'Legacy designer',
  );
  const legacyOrder = (
    await migrator.query(
      'SELECT id, position::text, revision FROM app."Task" WHERE "projectId"=$1 ORDER BY position,id',
      [legacyProject],
    )
  ).rows;
  assert.deepEqual(
    legacyOrder.map((t) => t.id),
    [legacyTask, legacyTie].sort(),
  );
  assert.deepEqual(
    legacyOrder.map((t) => t.position),
    ['1024.000000000000000', '2048.000000000000000'],
  );
  assert.ok(legacyOrder.every((t) => t.revision === 1));
  migrate(
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--exit-code',
  );
  assert.equal(
    (
      await migrator.query(
        'SELECT count(*)::int AS count FROM public._prisma_migrations WHERE finished_at IS NOT NULL',
      )
    ).rows[0].count,
    (await readdir(resolve(root, 'prisma/migrations'))).filter((name) =>
      /^\d/.test(name),
    ).length,
  );
  await checkDatabase(runtimeUrl);
  console.log(
    'PASS: migration chain, populated upgrade, repeated deploy and Prisma schema drift',
  );
  phase = 'real HTTP/domain/Redis regressions';
  await checkHttpScenarios({
    runtimeUrl,
    migrator,
    redisPort,
    redisPassword: credentials.REDIS_PASSWORD,
  });
  if (process.env.DOMAIN_MIGRATION_IMAGE) {
    phase = 'migration Docker image';
    credentials.MIGRATION_DATABASE_URL = `postgresql://task_tracker_migrator:${credentials.POSTGRES_MIGRATION_PASSWORD}@postgres:5432/task_tracker?schema=public`;
    docker(
      'run',
      '--rm',
      '--network',
      networkName,
      '-e',
      'MIGRATION_DATABASE_URL',
      process.env.DOMAIN_MIGRATION_IMAGE,
    );
  }
  if (process.env.DOMAIN_API_IMAGE) {
    phase = 'runtime Docker image health and routes';
    const smokeSource = 'worker-smoke:' + randomUUID();
    await migrator.query(
      'INSERT INTO app."ProjectMember" ("organizationId","projectId","userId") VALUES ($1,$2,$3)',
      [org, legacyProject, user],
    );
    await migrator.query(
      'INSERT INTO app."NotificationJob" (id,"sourceKey","recipientId","taskId",kind,title,body) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        smokeSource,
        user,
        legacyTask,
        'TASK_ASSIGNED',
        'Smoke',
        'Smoke',
      ],
    );

    credentials.DATABASE_URL = `postgresql://task_tracker_app:${credentials.POSTGRES_APP_PASSWORD}@postgres:5432/task_tracker`;
    credentials.JWT_SECRET = randomBytes(32).toString('hex');
    docker(
      'run',
      '-d',
      '--name',
      apiName,
      '--network',
      networkName,
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '-e',
      'NODE_ENV=production',
      '-e',
      'DATABASE_URL',
      '-e',
      'JWT_SECRET',
      '-e',
      'REDIS_HOST=redis',
      '-e',
      'REDIS_PASSWORD',
      process.env.DOMAIN_API_IMAGE,
    );
    created.push(apiName);
    await ready(() =>
      assert.equal(
        docker('inspect', '--format', '{{.State.Health.Status}}', apiName),
        'healthy',
      ),
    );
    docker(
      'exec',
      apiName,
      'node',
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict'; const base='http://127.0.0.1:3001'; assert.equal((await fetch(base+'/health/ready')).status,200); assert.equal((await fetch(base+'/users/profile')).status,401); const spec=await (await fetch(base+'/docs-json')).json(); assert.ok(spec.components.schemas.SessionDto.properties.authenticated);",
    );
    await ready(async () =>
      assert.equal(
        (
          await migrator.query(
            'SELECT count(*)::int AS count FROM app."Notification" WHERE "sourceKey"=$1',
            [smokeSource],
          )
        ).rows[0].count,
        1,
      ),
    );
    console.log(
      'PASS: non-root runtime health, cookie guard, Swagger and automatic notification worker delivery',
    );
  }
} catch (error) {
  console.error('FAIL:', phase, '(' + error.name + ')');
  // SQL/driver errors can include secrets. Only assertion messages and source locations are safe here.
  if (error.name === 'AssertionError') console.error(error.message);
  console.error(error.stack?.split('\n').slice(1, 3).join('\n'));
  process.exitCode = 1;
} finally {
  await migrator?.end();
  for (const name of created.reverse()) {
    try {
      docker('rm', '-f', name);
    } catch {
      console.error('Could not remove own test container:', name);
      process.exitCode = 1;
    }
  }
  if (networkCreated) {
    try {
      docker('network', 'rm', networkName);
    } catch {
      console.error('Could not remove test network');
      process.exitCode = 1;
    }
  }
  if (temp) await rm(temp, { recursive: true, force: true });
}
