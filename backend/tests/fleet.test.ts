import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/app.js';
import type { AdminVehicle, FleetInput, FleetPatch } from '../src/models/fleet.model.js';
import type { StoredUser } from '../src/models/user.model.js';
import type { FleetRepository } from '../src/repositories/fleet.repository.js';
import { AuthService } from '../src/services/auth.service.js';
import { HealthService } from '../src/services/health.service.js';
import { FleetService } from '../src/services/fleet.service.js';
import { PasswordService } from '../src/services/password.service.js';
import { TokenService } from '../src/services/token.service.js';
import { parseFleetCreate, parseFleetPatch, parseFacts } from '../src/validators/fleet.validator.js';
import { ApiError } from '../src/utils/api-error.js';

const base = { marca: 'Mitsubishi', modelo: 'Outlander', categoria_id: 2, anio: 2017 };

test('fleet accepts incomplete units without inventing rates, mileage, trim or drivetrain', () => {
  const vehicle = parseFleetCreate(base);
  assert.equal(vehicle.precio_dia, null);
  assert.equal(vehicle.kilometraje, null);
  assert.equal(vehicle.placa, null);
  assert.equal(vehicle.ubicacion_actual_id, null);
  assert.equal(vehicle.ficha.version, null);
  assert.equal(vehicle.ficha.traccion, null);
  assert.equal(vehicle.publicado, false);
  assert.equal(vehicle.estado_operativo, 'inactivo');
});

test('fleet rejects invalid prices, mileage, read-only fields and missing identity', () => {
  const invalid = [{}, { ...base, id: 10 }, { ...base, precio_dia: 55 }, { ...base, precio_dia: '0' }, { ...base, precio_dia: '3.141' }, { ...base, kilometraje: -1 }, { ...base, publicado: 'true' }, { ...base, anio: 3000 }];
  for (const input of invalid) assert.throws(() => parseFleetCreate(input), ApiError);
});

test('fleet patch retains explicit null and normalizes exact prices', () => {
  assert.deepEqual(parseFleetPatch({ precio_dia: '55.5', kilometraje: 0, placa: null }), { precio_dia: '55.50', kilometraje: 0, placa: null });
  assert.throws(() => parseFleetPatch({}), ApiError);
});

test('fleet photos allow HTTPS and safe local assets; reject traversal and executable URLs', () => {
  const valid = parseFacts({ fotos: [{ url: '/media/vehicles/car-1.jpeg', alt: 'Vehículo' }] });
  assert.equal(valid.fotos.length, 1);
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/media/vehicles/../../.env', 'http://example.com/car.jpg', 'https://user:pass@example.com/car.jpg']) {
    assert.throws(() => parseFacts({ fotos: [{ url, alt: 'Vehículo' }] }), ApiError);
  }
});

class MemoryFleet implements FleetRepository {
  calls = 0;
  rows: AdminVehicle[] = [];
  async list() { this.calls++; return { vehicles: this.rows, total: this.rows.length }; }
  async create(input: FleetInput) {
    this.calls++;
    const row = { ...input, id: this.rows.length + 1, codigo_interno: null, marca_id: 1, modelo_id: 1 };
    this.rows.push(row);
    return row;
  }
  async update(id: number, patch: FleetPatch) {
    this.calls++;
    const row = this.rows.find((item) => item.id === id);
    if (!row) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'El vehículo no existe.');
    Object.assign(row, patch);
    return row;
  }
}

async function start(t: TestContext, role: StoredUser['rol'] = 'administrador') {
  const user: StoredUser = { id: 7, nombres: 'Prueba', apellidos: 'Flota', email: 'fleet@example.test', telefono: null, rol: role, passwordHash: 'not-used', activo: true };
  const tokens = new TokenService({ secret: 'a'.repeat(43), expiresInSeconds: 3600 });
  const auth = new AuthService({
    async findById() { return user; }, async findByEmail() { return user; }, async createClient() { return user; },
  }, new PasswordService(), tokens);
  const repository = new MemoryFleet();
  const server = createServer(createApp(new HealthService({ async checkDatabase() {} }), auth, undefined, new FleetService(repository)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${tokens.sign(7)}`, 'content-type': 'application/json' };
  return { url, headers, repository, user };
}

test('fleet CRUD requires authentication and live administrator role', async (t) => {
  const { url, headers, repository, user } = await start(t, 'cliente');
  assert.equal((await fetch(`${url}/api/v1/admin/vehicles`)).status, 401);
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const path = method === 'PATCH' || method === 'DELETE' ? '/1' : '';
    assert.equal((await fetch(`${url}/api/v1/admin/vehicles${path}`, { method, headers })).status, 403);
  }
  assert.equal(repository.calls, 0);
  user.rol = 'administrador';
  assert.equal((await fetch(`${url}/api/v1/admin/vehicles`, { headers })).status, 200);
  user.activo = false;
  assert.equal((await fetch(`${url}/api/v1/admin/vehicles`, { headers })).status, 401);
});

test('administrator creates more units, edits them and retires without deleting history', async (t) => {
  const { url, headers, repository } = await start(t);
  for (let i = 0; i < 4; i++) assert.equal((await fetch(`${url}/api/v1/admin/vehicles`, { method: 'POST', headers, body: JSON.stringify(base) })).status, 201);
  const update = await fetch(`${url}/api/v1/admin/vehicles/1`, { method: 'PATCH', headers, body: JSON.stringify({ precio_dia: '60', kilometraje: 80000, publicado: true }) });
  assert.equal(update.status, 200);
  assert.equal(repository.rows[0]?.precio_dia, '60.00');
  assert.equal(repository.rows[0]?.modelo, 'Outlander');
  const retired = await fetch(`${url}/api/v1/admin/vehicles/1`, { method: 'DELETE', headers });
  assert.equal(retired.status, 200);
  assert.equal(repository.rows[0]?.publicado, false);
  assert.equal(repository.rows.length, 4);
});

test('administrator receives validation errors and missing vehicles safely', async (t) => {
  const { url, headers, repository } = await start(t);
  assert.equal((await fetch(`${url}/api/v1/admin/vehicles?publicado=true`, { headers })).status, 400);
  assert.equal((await fetch(`${url}/api/v1/admin/vehicles`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${url}/api/v1/admin/vehicles/999`, { method: 'PATCH', headers, body: JSON.stringify({ publicado: false }) })).status, 404);
  assert.equal(repository.calls, 1);
});

test('vehicle photos are served with an image content type and private files stay unavailable', async (t) => {
  const { url } = await start(t);
  const photo = await fetch(`${url}/media/vehicles/outlander-gris-1.jpeg`);
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get('content-type') ?? '', /^image\/jpeg/);
  await photo.arrayBuffer();
  assert.equal((await fetch(`${url}/media/vehicles/.env`)).status, 404);
});
