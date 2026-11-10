import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/app.js';
import type { HealthRepository } from '../src/repositories/health.repository.js';
import { HealthService } from '../src/services/health.service.js';

const fixedDate = new Date('2026-10-27T04:00:00.000Z');
const privateDiagnostic = 'SELECT secret FROM usuarios; password=not-for-clients';

class FakeHealthRepository implements HealthRepository {
  calls = 0;

  constructor(private readonly failure?: Error) {}

  async checkDatabase(): Promise<void> {
    this.calls += 1;
    if (this.failure) throw this.failure;
  }
}

async function startServer(t: TestContext, service: HealthService): Promise<string> {
  const server = createServer(createApp(service));
  t.after(async () => {
    const closed = new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    await closed;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function assertPublicError(body: unknown, code: string): void {
  assert.ok(body && typeof body === 'object');
  const result = body as Record<string, unknown>;
  assert.equal(result.success, false);
  assert.ok(result.error && typeof result.error === 'object');
  const error = result.error as Record<string, unknown>;
  assert.equal(error.code, code);
  assert.equal(typeof error.message, 'string');
  assert.ok((error.message as string).length > 0);
  assert.deepEqual(Object.keys(result).sort(), ['error', 'success']);
  assert.deepEqual(Object.keys(error).sort(), ['code', 'message']);
  assert.doesNotMatch(JSON.stringify(body), /SELECT secret|not-for-clients|\bat\s+\w+.*\(/);
}

test('GET health answers without consulting MySQL', async (t) => {
  const repository = new FakeHealthRepository(new Error(privateDiagnostic));
  const url = await startServer(t, new HealthService(repository, () => fixedDate));

  const response = await fetch(`${url}/api/v1/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      service: 'autorent-api',
      status: 'ok',
      timestamp: fixedDate.toISOString(),
    },
  });
  assert.equal(repository.calls, 0);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('GET database health checks the repository before confirming the connection', async (t) => {
  const repository = new FakeHealthRepository();
  const url = await startServer(t, new HealthService(repository, () => fixedDate));

  const response = await fetch(`${url}/api/v1/health/database`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      service: 'autorent-api',
      status: 'ok',
      database: 'connected',
      timestamp: fixedDate.toISOString(),
    },
  });
  assert.equal(repository.calls, 1);
});

test('database failures return 503 without exposing database diagnostics', async (t) => {
  const repository = new FakeHealthRepository(new Error(privateDiagnostic));
  const url = await startServer(t, new HealthService(repository));

  const response = await fetch(`${url}/api/v1/health/database`);

  assert.equal(response.status, 503);
  assertPublicError(await response.json(), 'DATABASE_UNAVAILABLE');
  assert.equal(repository.calls, 1);
});

test('unknown routes return the standard 404 response', async (t) => {
  const repository = new FakeHealthRepository();
  const url = await startServer(t, new HealthService(repository));

  const response = await fetch(`${url}/api/v1/does-not-exist`);

  assert.equal(response.status, 404);
  assertPublicError(await response.json(), 'NOT_FOUND');
  assert.equal(repository.calls, 0);
});

test('malformed JSON returns 400 before reaching a route', async (t) => {
  const repository = new FakeHealthRepository();
  const url = await startServer(t, new HealthService(repository));

  const response = await fetch(`${url}/api/v1/does-not-exist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"password":"not-for-clients",',
  });

  assert.equal(response.status, 400);
  assertPublicError(await response.json(), 'INVALID_JSON');
  assert.equal(repository.calls, 0);
});

test('oversized JSON returns 413 without echoing request content', async (t) => {
  const repository = new FakeHealthRepository();
  const url = await startServer(t, new HealthService(repository));

  const response = await fetch(`${url}/api/v1/does-not-exist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'not-for-clients', content: 'x'.repeat(17 * 1024) }),
  });

  assert.equal(response.status, 413);
  assertPublicError(await response.json(), 'PAYLOAD_TOO_LARGE');
  assert.equal(repository.calls, 0);
});

test('unexpected controller failures return a generic 500 response', async (t) => {
  class BrokenHealthService extends HealthService {
    override getStatus(): ReturnType<HealthService['getStatus']> {
      throw new Error(privateDiagnostic);
    }
  }

  const repository = new FakeHealthRepository();
  const url = await startServer(t, new BrokenHealthService(repository));
  const response = await fetch(`${url}/api/v1/health`);

  assert.equal(response.status, 500);
  assertPublicError(await response.json(), 'INTERNAL_SERVER_ERROR');
});
