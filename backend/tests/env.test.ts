import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvironment } from '../src/config/env.js';

const testJwtSecret = 'a'.repeat(43);

test('environment defaults use the local application account', () => {
  const config = parseEnvironment({ DB_PASSWORD: 'local-test-password', JWT_SECRET: testJwtSecret });

  assert.deepEqual(config, {
    nodeEnv: 'development',
    host: '127.0.0.1',
    port: 3000,
    database: {
      host: '127.0.0.1',
      port: 3306,
      name: 'autorent',
      user: 'autorent_app',
      password: 'local-test-password',
    },
    auth: { secret: testJwtSecret, expiresInSeconds: 3600 },
  });
});

test('environment accepts explicit connection settings and preserves the password exactly', () => {
  const source: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    HOST: '0.0.0.0',
    PORT: '3001',
    DB_HOST: 'localhost',
    DB_PORT: '3307',
    DB_NAME: 'autorent_test',
    DB_USER: 'test_user',
    DB_PASSWORD: '  password with spaces  ',
    JWT_SECRET: testJwtSecret,
  };

  assert.deepEqual(parseEnvironment(source), {
    nodeEnv: 'test',
    host: '0.0.0.0',
    port: 3001,
    database: {
      host: 'localhost',
      port: 3307,
      name: 'autorent_test',
      user: 'test_user',
      password: '  password with spaces  ',
    },
    auth: { secret: testJwtSecret, expiresInSeconds: 3600 },
  });
  assert.equal(source.DB_PASSWORD, '  password with spaces  ');
});

for (const variable of ['PORT', 'DB_PORT'] as const) {
  for (const value of ['3000abc', '0', '65536', '-1', '3000.5']) {
    test(`${variable} rejects the invalid port ${JSON.stringify(value)} without revealing credentials`, () => {
      assert.throws(() => parseEnvironment({
        DB_PASSWORD: 'not-for-clients',
        JWT_SECRET: testJwtSecret,
        [variable]: value,
      }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(variable));
        assert.doesNotMatch(error.message, /not-for-clients/);
        return true;
      });
    });
  }
}

test('environment requires a database password', () => {
  assert.throws(() => parseEnvironment({}), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /DB_PASSWORD/);
    return true;
  });
});

test('environment rejects unrecognized runtime modes', () => {
  assert.throws(() => parseEnvironment({
    NODE_ENV: 'testing',
    DB_PASSWORD: 'not-for-clients',
    JWT_SECRET: testJwtSecret,
  }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /NODE_ENV/);
    assert.doesNotMatch(error.message, /not-for-clients/);
    return true;
  });
});

for (const value of [undefined, '', 'short', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}!`]) {
  test(`environment rejects an absent or invalid JWT secret (${value === undefined ? 'undefined' : value.length})`, () => {
    const source: NodeJS.ProcessEnv = { DB_PASSWORD: 'not-for-clients' };
    if (value !== undefined) source.JWT_SECRET = value;

    assert.throws(() => parseEnvironment(source), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /JWT_SECRET/);
      assert.doesNotMatch(error.message, /not-for-clients/);
      if (value && value.length > 10) assert.ok(!error.message.includes(value));
      return true;
    });
  });
}
