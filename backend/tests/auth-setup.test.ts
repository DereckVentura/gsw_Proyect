import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import dotenv from 'dotenv';

const scriptUrl = new URL('../scripts/setup-auth-secret.mjs', import.meta.url).href;
const fakeDatabaseLine = 'DB_PASSWORD="fixture-only # value with spaces"';

async function fixture(t: TestContext, contents?: string): Promise<string> {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, 'autorent-auth-setup-'));
  assert.equal(dirname(resolve(directory)), temporaryRoot);
  assert.ok(basename(directory).startsWith('autorent-auth-setup-'));
  t.after(async () => {
    // El directorio exacto fue creado y verificado dentro de la carpeta temporal.
    await rm(directory, { recursive: true, force: true });
  });
  const path = join(directory, '.env');
  if (contents !== undefined) await writeFile(path, contents, 'utf8');
  return path;
}

function runSetup(path: string): { status: number | null; result: Record<string, unknown>; output: string } {
  // execFile/spawn recibe argumentos separados: el archivo privado no pasa por un shell.
  const source = `
    const { setupAuthSecret } = await import(${JSON.stringify(scriptUrl)});
    try {
      const result = await setupAuthSecret(${JSON.stringify(path)});
      process.stdout.write(JSON.stringify({ result }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ code: error.code, message: error.message }));
      process.exitCode = 1;
    }
  `;
  const processResult = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' });
  assert.equal(processResult.error, undefined);
  assert.equal(processResult.stderr, '');
  return {
    status: processResult.status,
    result: JSON.parse(processResult.stdout) as Record<string, unknown>,
    output: processResult.stdout,
  };
}

test('auth setup creates a random secret and preserves the original database configuration exactly', async (t) => {
  const original = `# Private fixture\n${fakeDatabaseLine}\nDB_USER=fixture-user\n`;
  const path = await fixture(t, original);
  const outcome = runSetup(path);
  assert.equal(outcome.status, 0);
  assert.deepEqual(outcome.result, { result: 'created' });
  const updated = await readFile(path, 'utf8');
  assert.ok(updated.startsWith(original));
  assert.match(dotenv.parse(updated).JWT_SECRET ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.equal(dotenv.parse(updated).DB_PASSWORD, 'fixture-only # value with spaces');
  assert.doesNotMatch(outcome.output, /fixture-only|DB_PASSWORD|DB_USER/);
});

test('auth setup is idempotent and never rotates an existing valid secret', async (t) => {
  const path = await fixture(t, `${fakeDatabaseLine}\n`);
  assert.equal(runSetup(path).result.result, 'created');
  const original = await readFile(path, 'utf8');
  const outcome = runSetup(path);
  assert.equal(outcome.status, 0);
  assert.deepEqual(outcome.result, { result: 'existing' });
  assert.equal(await readFile(path, 'utf8'), original);
});

test('auth setup replaces a blank exported assignment while preserving CRLF and neighboring credentials', async (t) => {
  const original = `${fakeDatabaseLine}\r\n\r\n \texport \tJWT_SECRET = "" # empty\r\nDB_PORT=3306\r\n`;
  const path = await fixture(t, original);
  assert.equal(runSetup(path).status, 0);
  const updated = await readFile(path, 'utf8');
  assert.ok(updated.startsWith(`${fakeDatabaseLine}\r\n\r\n`));
  assert.ok(updated.endsWith('\r\nDB_PORT=3306\r\n'));
  assert.match(updated, /\r\nJWT_SECRET="[A-Za-z0-9_-]{43}"\r\n/);
  assert.equal((updated.match(/^JWT_SECRET=/gm) ?? []).length, 1);
});

test('auth setup rejects duplicate assignments without changing any file content', async (t) => {
  for (const duplicate of ['JWT_SECRET=\nJWT_SECRET=\n', 'JWT_SECRET=\nexport JWT_SECRET: ""\n']) {
    const original = `${fakeDatabaseLine}\n${duplicate}`;
    const path = await fixture(t, original);
    const outcome = runSetup(path);
    assert.equal(outcome.status, 1);
    assert.deepEqual(outcome.result, { code: 'DUPLICATE_JWT_SECRET', message: 'DUPLICATE_JWT_SECRET' });
    assert.equal(await readFile(path, 'utf8'), original);
    assert.doesNotMatch(outcome.output, /fixture-only|DB_PASSWORD/);
  }
});

test('auth setup rejects an invalid existing secret without replacing it or the database password', async (t) => {
  const original = `${fakeDatabaseLine}\nJWT_SECRET="invalid-fixture-value"\n`;
  const path = await fixture(t, original);
  const outcome = runSetup(path);
  assert.equal(outcome.status, 1);
  assert.deepEqual(outcome.result, { code: 'INVALID_JWT_SECRET', message: 'INVALID_JWT_SECRET' });
  assert.equal(await readFile(path, 'utf8'), original);
  assert.doesNotMatch(outcome.output, /invalid-fixture-value|fixture-only/);
});

test('auth setup reports a missing file safely and does not create it', async (t) => {
  const path = await fixture(t);
  const outcome = runSetup(path);
  assert.equal(outcome.status, 1);
  assert.deepEqual(outcome.result, { code: 'AUTH_SETUP_ERROR', message: 'AUTH_SETUP_ERROR' });
  assert.ok(!outcome.output.includes(path));
  await assert.rejects(access(path));
});

test('auth setup preserves assignment-like text inside a multiline database password', async (t) => {
  const original = 'DB_PASSWORD="fixture first line\nJWT_SECRET=\nfixture last line"\nDB_USER=fixture-user\n';
  const path = await fixture(t, original);
  assert.equal(runSetup(path).status, 0);
  const updated = await readFile(path, 'utf8');
  assert.ok(updated.startsWith(original));
  assert.equal(dotenv.parse(updated).DB_PASSWORD, dotenv.parse(original).DB_PASSWORD);
  assert.match(dotenv.parse(updated).JWT_SECRET ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.equal(runSetup(path).result.result, 'existing');
  assert.equal(await readFile(path, 'utf8'), updated);
});

test('auth setup recognizes a blank assignment after a UTF-8 BOM', async (t) => {
  const path = await fixture(t, `\uFEFFJWT_SECRET=""\r\n${fakeDatabaseLine}\r\n`);
  assert.equal(runSetup(path).status, 0);
  const updated = await readFile(path, 'utf8');
  assert.ok(updated.startsWith('\uFEFFJWT_SECRET="'));
  assert.match(dotenv.parse(updated).JWT_SECRET ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.ok(updated.endsWith(`${fakeDatabaseLine}\r\n`));
});
