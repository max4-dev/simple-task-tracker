import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('env:init creates private unique credentials and never overwrites an existing file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tt-env-test-'));
  try {
    const script = new URL('./init-env.mjs', import.meta.url).pathname;
    execFileSync(process.execPath, [script], { cwd, stdio: 'pipe' });
    const file = join(cwd, '.env');
    const first = await readFile(file, 'utf8');
    const secrets = [
      ...first.matchAll(
        /^(?:POSTGRES_PASSWORD|POSTGRES_MIGRATION_PASSWORD|POSTGRES_APP_PASSWORD|REDIS_PASSWORD|JWT_SECRET)=([a-f0-9]{64})$/gm,
      ),
    ].map((m) => m[1]);
    assert.equal(new Set(secrets).size, 5);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    execFileSync(process.execPath, [script], { cwd, stdio: 'pipe' });
    assert.equal(first === (await readFile(file, 'utf8')), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
