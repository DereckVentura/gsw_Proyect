import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express, { type Express } from 'express';
import { createApp } from '../src/app.js';
import { createRequireAuth } from '../src/middlewares/auth.middleware.js';
import { errorHandler } from '../src/middlewares/error-handler.middleware.js';
import { requireRole } from '../src/middlewares/role.middleware.js';
import type { CreateClientInput, StoredUser, User } from '../src/models/user.model.js';
import type { UserRepository } from '../src/repositories/user.repository.js';
import { AuthService } from '../src/services/auth.service.js';
import { HealthService } from '../src/services/health.service.js';
import { PasswordService } from '../src/services/password.service.js';
import { TokenService } from '../src/services/token.service.js';
import { ApiError } from '../src/utils/api-error.js';
import { parseLoginInput, parseRegisterInput } from '../src/validators/auth.validator.js';

// Datos de prueba locales: nunca se leen .env ni cuentas de MySQL.
const testSecret = 'a'.repeat(43);
const testPassword = 'Frase de prueba segura 2026!';
const passwords = new PasswordService();
const initialPasswordHash = await passwords.hash(testPassword);
const privateDiagnostic = 'SELECT password_hash FROM usuarios; password=not-for-clients';
const defaultRegistration = {
  nombres: 'María José',
  apellidos: 'López',
  email: 'maria@example.com',
  password: testPassword,
};

function publicUser(user: User): User {
  return {
    id: user.id,
    nombres: user.nombres,
    apellidos: user.apellidos,
    email: user.email,
    telefono: user.telefono,
    rol: user.rol,
  };
}

function storedUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: 7,
    nombres: 'María José',
    apellidos: 'López',
    email: 'maria@example.com',
    telefono: null,
    rol: 'cliente',
    passwordHash: initialPasswordHash,
    activo: true,
    ...overrides,
  };
}

class FakeUserRepository implements UserRepository {
  readonly users = new Map<number, StoredUser>();
  readonly created: CreateClientInput[] = [];
  emailReads = 0;
  idReads = 0;
  failure: Error | undefined;

  constructor(user?: StoredUser) {
    if (user) this.users.set(user.id, user);
  }

  async findByEmail(email: string): Promise<StoredUser | null> {
    this.emailReads += 1;
    if (this.failure) throw this.failure;
    return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
  }

  async findById(id: number): Promise<StoredUser | null> {
    this.idReads += 1;
    if (this.failure) throw this.failure;
    return this.users.get(id) ?? null;
  }

  async createClient(input: CreateClientInput): Promise<User> {
    if (this.failure) throw this.failure;
    if (Array.from(this.users.values()).some((user) => user.email === input.email)) {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe una cuenta con ese correo electrónico.');
    }
    this.created.push(input);
    const user: StoredUser = {
      id: this.users.size + 1,
      ...input,
      rol: 'cliente',
      activo: true,
    };
    this.users.set(user.id, user);
    return publicUser(user);
  }
}

function createServices(repository = new FakeUserRepository()) {
  const tokens = new TokenService({ secret: testSecret, expiresInSeconds: 3600 });
  const auth = new AuthService(repository, passwords, tokens);
  const health = new HealthService({ async checkDatabase() {} });
  return { repository, tokens, auth, health };
}

async function startServer(t: TestContext, app: Express): Promise<string> {
  const server = createServer(app);
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

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function assertPublicError(body: unknown, code: string): void {
  assert.ok(body && typeof body === 'object');
  const result = body as Record<string, unknown>;
  assert.equal(result.success, false);
  assert.ok(result.error && typeof result.error === 'object');
  const error = result.error as Record<string, unknown>;
  assert.equal(error.code, code);
  assert.equal(typeof error.message, 'string');
  assert.deepEqual(Object.keys(result).sort(), ['error', 'success']);
  assert.deepEqual(Object.keys(error).sort(), ['code', 'message']);
  assert.doesNotMatch(JSON.stringify(body), /SELECT password_hash|not-for-clients|\$2[aby]\$|passwordHash/);
  assert.ok(!JSON.stringify(body).includes(testPassword));
}

function assertValidationFailure(callback: () => unknown): void {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    return true;
  });
}

function payloadOf(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1];
  assert.ok(encoded);
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function signedPayload(payload: Record<string, unknown>, secret = testSecret, algorithm = 'HS256'): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: algorithm })).toString('base64url');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const content = `${header}.${encoded}`;
  const signature = createHmac(algorithm === 'HS512' ? 'sha512' : 'sha256', secret)
    .update(content).digest('base64url');
  return `${content}.${signature}`;
}

test('passwords use bcrypt cost 12 and verify the exact password including spaces', async () => {
  const password = `  ${testPassword}  `;
  const hash = await passwords.hash(password);

  assert.match(hash, /^\$2[aby]\$12\$/);
  assert.notEqual(hash, password);
  assert.equal(await passwords.verify(password, hash), true);
  assert.equal(await passwords.verify(password.trim(), hash), false);
  assert.equal(await passwords.verify('otra contraseña incorrecta', hash), false);
});

test('registration normalizes contact fields while preserving the exact password', () => {
  const password = `  ${testPassword}  `;
  assert.deepEqual(parseRegisterInput({
    nombres: '  María José  ', apellidos: '  López  ', email: ' MARIA@EXAMPLE.COM ',
    telefono: ' +503 7000-0000 ', password,
  }), {
    nombres: 'María José', apellidos: 'López', email: 'maria@example.com',
    telefono: '+503 7000-0000', password,
  });
  for (const telefono of [undefined, null, '   ']) {
    assert.equal(parseRegisterInput({ ...defaultRegistration, telefono }).telefono, null);
  }
  assert.deepEqual(parseLoginInput({ email: ' MARIA@EXAMPLE.COM ', password }), {
    email: 'maria@example.com', password,
  });
});

test('registration counts Unicode characters and rejects passwords beyond bcrypt 72 byte limit', () => {
  for (const password of ['x'.repeat(8), 'x'.repeat(72), 'á'.repeat(36), '😀'.repeat(18)]) {
    assert.equal(parseRegisterInput({ ...defaultRegistration, password }).password, password);
  }
  for (const password of ['', 'x'.repeat(7), '😀'.repeat(7), 'x'.repeat(73), 'á'.repeat(37), '😀'.repeat(19), `unpaired surrogate \ud800`]) {
    assertValidationFailure(() => parseRegisterInput({ ...defaultRegistration, password }));
  }
  assert.equal(parseLoginInput({ email: defaultRegistration.email, password: 'corta' }).password, 'corta');
  assertValidationFailure(() => parseLoginInput({ email: defaultRegistration.email, password: 'á'.repeat(37) }));
  assertValidationFailure(() => parseLoginInput({ email: defaultRegistration.email, password: '\ud800' }));
});

test('registration rejects privilege fields, malformed identity data and non-object bodies', () => {
  for (const field of ['rol', 'activo', 'id', 'passwordHash']) {
    assertValidationFailure(() => parseRegisterInput({ ...defaultRegistration, [field]: 'administrador' }));
  }
  for (const body of [null, [], 'texto', 42, {}]) {
    assertValidationFailure(() => parseRegisterInput(body));
  }
  for (const override of [
    { nombres: '' }, { nombres: 'x'.repeat(101) }, { nombres: 'María\u0000José' },
    { apellidos: 'López\nPérez' }, { email: "' OR 1=1 --" }, { email: 'dos@@example.com' },
    { email: 'maria@localhost' }, { email: 'maria@-example.com' }, { email: 'maría@example.com' },
    { telefono: 'llámame' }, { telefono: '1'.repeat(26) },
  ]) {
    assertValidationFailure(() => parseRegisterInput({ ...defaultRegistration, ...override }));
  }
  assertValidationFailure(() => parseLoginInput({ email: defaultRegistration.email, password: testPassword, rol: 'administrador' }));
});

test('tokens have a one hour lifetime and contain no user profile or password data', () => {
  const { tokens } = createServices();
  const token = tokens.sign(7);
  const claims = payloadOf(token);

  assert.equal(tokens.verify(token), 7);
  assert.equal(claims.sub, '7');
  assert.equal(claims.iss, 'autorent-api');
  assert.equal(claims.aud, 'autorent-mobile');
  assert.equal(Number(claims.exp) - Number(claims.iat), 3600);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
  assert.doesNotMatch(JSON.stringify(claims), /maria|password|rol|activo/);
});

test('tokens reject bad signatures, other algorithms, expiry, wrong claims and noncanonical user ids', () => {
  const { tokens } = createServices();
  const claims = payloadOf(tokens.sign(7));
  const now = Math.floor(Date.now() / 1000);
  const invalid = [
    '', 'invalid.token', 'x'.repeat(4097),
    signedPayload(claims, 'b'.repeat(43)),
    signedPayload(claims, testSecret, 'HS512'),
    ...[
      { exp: now - 1, iat: now - 3601 }, { iss: 'another-api' }, { aud: 'another-client' },
      { exp: now + 7200 }, { iat: now + 60 }, { exp: undefined }, { iat: undefined },
      { sub: '0' }, { sub: '-1' }, { sub: '07' }, { sub: '7.0' }, { sub: 7 },
      { sub: '4294967296' }, { sub: '7 OR 1=1' },
    ].map((override) => signedPayload({ ...claims, ...override })),
  ];
  for (const token of invalid) {
    assert.throws(() => tokens.verify(token), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, 'INVALID_TOKEN');
      assert.ok(!error.message.includes(token) || token.length === 0);
      return true;
    });
  }
});

test('POST register creates only a client, stores a hash and returns a public profile', async (t) => {
  const fixture = createServices();
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const response = await postJson(`${url}/api/v1/auth/register`, {
    ...defaultRegistration, email: ' MARIA@EXAMPLE.COM ', telefono: '+503 7000-0000',
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    success: true,
    data: { user: { id: 1, nombres: 'María José', apellidos: 'López', email: 'maria@example.com', telefono: '+503 7000-0000', rol: 'cliente' } },
  });
  assert.equal(fixture.repository.created.length, 1);
  const created = fixture.repository.created[0];
  assert.ok(created);
  assert.equal(await passwords.verify(testPassword, created.passwordHash), true);
  assert.ok(!Object.hasOwn(created, 'rol'));
  assert.ok(!Object.hasOwn(created, 'password'));
});

test('duplicate registration returns 409 without modifying the existing account', async (t) => {
  const existing = storedUser({ rol: 'administrador' });
  const fixture = createServices(new FakeUserRepository(existing));
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const response = await postJson(`${url}/api/v1/auth/register`, defaultRegistration);

  assert.equal(response.status, 409);
  assertPublicError(await response.json(), 'EMAIL_ALREADY_EXISTS');
  assert.equal(fixture.repository.created.length, 0);
  assert.deepEqual(fixture.repository.users.get(existing.id), existing);
});

test('HTTP registration rejects injected admin fields before accessing the repository', async (t) => {
  const fixture = createServices();
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const response = await postJson(`${url}/api/v1/auth/register`, { ...defaultRegistration, rol: 'administrador' });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assertPublicError(await response.json(), 'VALIDATION_ERROR');
  assert.equal(fixture.repository.created.length + fixture.repository.emailReads + fixture.repository.idReads, 0);
});

test('POST login returns a signed bearer token and GET me resolves the current database profile', async (t) => {
  const user = storedUser();
  const fixture = createServices(new FakeUserRepository(user));
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const response = await postJson(`${url}/api/v1/auth/login`, { email: ' MARIA@EXAMPLE.COM ', password: testPassword });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as { success: boolean; data: { user: User; accessToken: string; tokenType: string; expiresIn: number } };
  assert.equal(body.success, true);
  assert.deepEqual(body.data.user, publicUser(user));
  assert.equal(body.data.tokenType, 'Bearer');
  assert.equal(body.data.expiresIn, 3600);
  assert.equal(fixture.tokens.verify(body.data.accessToken), user.id);
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|password_hash|\$2[aby]\$/);

  user.nombres = 'Nombre actualizado';
  user.rol = 'administrador';
  const me = await fetch(`${url}/api/v1/auth/me`, { headers: { authorization: `Bearer ${body.data.accessToken}` } });
  assert.equal(me.status, 200);
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await me.json(), { success: true, data: { user: publicUser(user) } });
  assert.equal(fixture.repository.idReads, 1);
});

test('login hides whether the email is absent, password is wrong or account is inactive', async (t) => {
  const fixture = createServices(new FakeUserRepository(storedUser()));
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const cases = [
    { email: 'absent@example.com', password: testPassword },
    { email: defaultRegistration.email, password: 'clave de prueba equivocada' },
    { email: 'inactive@example.com', password: testPassword },
  ];
  fixture.repository.users.set(8, storedUser({ id: 8, email: 'inactive@example.com', activo: false }));
  const bodies: unknown[] = [];
  for (const input of cases) {
    const response = await postJson(`${url}/api/v1/auth/login`, input);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body: unknown = await response.json();
    assertPublicError(body, 'INVALID_CREDENTIALS');
    bodies.push(body);
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
});

test('absent and inactive accounts perform dummy password verification before rejecting login', async () => {
  const repository = new FakeUserRepository(storedUser({ activo: false }));
  const calls: string[] = [];
  const fixture = createServices(repository);
  const service = new AuthService(repository, {
    async hash() { throw new Error('hash should not be called'); },
    async verify() { calls.push('verify'); return true; },
    async burnDummy(password) { assert.equal(password, testPassword); calls.push('dummy'); },
  }, fixture.tokens);
  for (const email of ['absent@example.com', defaultRegistration.email]) {
    await assert.rejects(service.login({ email, password: testPassword }), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      return true;
    });
  }
  assert.deepEqual(calls, ['dummy', 'dummy']);
});

test('GET me rejects missing or invalid bearer tokens without consulting users', async (t) => {
  const fixture = createServices(new FakeUserRepository(storedUser()));
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  for (const authorization of [undefined, '', 'Basic abc', 'Bearer', 'Bearer invalid.token', 'Bearer a b']) {
    const headers: Record<string, string> = {};
    if (authorization !== undefined) headers.authorization = authorization;
    const response = await fetch(`${url}/api/v1/auth/me`, { headers });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertPublicError(await response.json(), authorization === undefined ? 'AUTHENTICATION_REQUIRED' : 'INVALID_TOKEN');
  }
  assert.equal(fixture.repository.idReads, 0);
});

test('GET me immediately rejects a previously valid token when its account is disabled or removed', async (t) => {
  const user = storedUser();
  const fixture = createServices(new FakeUserRepository(user));
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const headers = { authorization: `Bearer ${fixture.tokens.sign(user.id)}` };
  user.activo = false;
  let response = await fetch(`${url}/api/v1/auth/me`, { headers });
  assert.equal(response.status, 401);
  assertPublicError(await response.json(), 'INVALID_TOKEN');
  fixture.repository.users.delete(user.id);
  response = await fetch(`${url}/api/v1/auth/me`, { headers });
  assert.equal(response.status, 401);
  assertPublicError(await response.json(), 'INVALID_TOKEN');
  assert.equal(fixture.repository.idReads, 2);
});

test('role middleware checks the current database role and returns 403 for a client', async (t) => {
  const user = storedUser({ rol: 'administrador' });
  const fixture = createServices(new FakeUserRepository(user));
  const app = express();
  app.get('/admin', createRequireAuth(fixture.auth), requireRole('administrador'), (_request, response) => {
    response.json({ success: true });
  });
  app.use(errorHandler);
  const url = await startServer(t, app);
  const headers = { authorization: `Bearer ${fixture.tokens.sign(user.id)}` };

  assert.equal((await fetch(`${url}/admin`, { headers })).status, 200);
  user.rol = 'cliente';
  const response = await fetch(`${url}/admin`, { headers });
  assert.equal(response.status, 403);
  assertPublicError(await response.json(), 'FORBIDDEN');
  assert.equal(fixture.repository.idReads, 2);
});

test('unexpected authentication failures return a safe public error', async (t) => {
  const fixture = createServices(new FakeUserRepository(storedUser()));
  fixture.repository.failure = new Error(privateDiagnostic);
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  const response = await postJson(`${url}/api/v1/auth/login`, { email: defaultRegistration.email, password: testPassword });

  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assertPublicError(await response.json(), 'INTERNAL_SERVER_ERROR');
});

test('authentication JSON parser errors are not cached and never echo credentials', async (t) => {
  const fixture = createServices();
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  for (const input of [
    { body: '{"password":"not-for-clients",', status: 400, code: 'INVALID_JSON' },
    { body: JSON.stringify({ password: 'not-for-clients', data: 'x'.repeat(17 * 1024) }), status: 413, code: 'PAYLOAD_TOO_LARGE' },
  ]) {
    const response = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: input.body,
    });
    assert.equal(response.status, input.status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertPublicError(await response.json(), input.code);
  }
  assert.equal(fixture.repository.emailReads, 0);
});

test('register and login share a 30 request limit without blocking health or other app instances', async (t) => {
  const fixture = createServices();
  const url = await startServer(t, createApp(fixture.health, fixture.auth));
  for (let index = 0; index < 30; index += 1) {
    const route = index % 2 === 0 ? 'register' : 'login';
    const response = await postJson(`${url}/api/v1/auth/${route}`, {});
    assert.equal(response.status, 400);
    await response.arrayBuffer();
  }
  const blocked = await postJson(`${url}/api/v1/auth/login`, {});
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assertPublicError(await blocked.json(), 'TOO_MANY_REQUESTS');
  assert.equal((await fetch(`${url}/api/v1/health`)).status, 200);
  const secondUrl = await startServer(t, createApp(fixture.health, fixture.auth));
  assert.equal((await postJson(`${secondUrl}/api/v1/auth/login`, {})).status, 400);
  assert.equal(fixture.repository.created.length + fixture.repository.emailReads + fixture.repository.idReads, 0);
});
