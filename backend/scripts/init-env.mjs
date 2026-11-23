import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const secret = () => randomBytes(32).toString('hex');
const passwords = {
  POSTGRES_PASSWORD: secret(),
  POSTGRES_MIGRATION_PASSWORD: secret(),
  POSTGRES_APP_PASSWORD: secret(),
  REDIS_PASSWORD: secret(),
  JWT_SECRET: secret(),
};
let example = await readFile(
  new URL('../.env.example', import.meta.url),
  'utf8',
);
for (const [key, value] of Object.entries(passwords))
  example = example.replace(
    new RegExp('^' + key + '=$', 'm'),
    key + '=' + value,
  );
example = example
  .replaceAll('REPLACE_WITH_APP_PASSWORD', passwords.POSTGRES_APP_PASSWORD)
  .replaceAll(
    'REPLACE_WITH_MIGRATION_PASSWORD',
    passwords.POSTGRES_MIGRATION_PASSWORD,
  );
try {
  await writeFile('.env', example, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with unique local credentials (0600).');
} catch (error) {
  if (error.code !== 'EEXIST') throw new Error('Could not create .env');
  console.log('Existing .env preserved.');
}
