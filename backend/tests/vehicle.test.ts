import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/app.js';
import type { CatalogPeriod, CatalogsData, Vehicle, VehicleFilters } from '../src/models/vehicle.model.js';
import type { VehicleRepository } from '../src/repositories/vehicle.repository.js';
import { HealthService } from '../src/services/health.service.js';
import { VehicleService } from '../src/services/vehicle.service.js';
import { ApiError } from '../src/utils/api-error.js';
import { emptyFacts } from '../src/models/fleet.model.js';
import { parseVehicleDetailQuery, parseVehicleFilters, parseVehicleId } from '../src/validators/vehicle.validator.js';

// El catálogo se prueba sin leer .env, cuentas reales ni datos de MySQL.
const privateDiagnostic = 'SELECT password_hash FROM usuarios; password=not-for-clients';
const defaultVehicle: Vehicle = {
  id: 1,
  placa: 'DEMO-001',
  anio: 2023,
  kilometraje: 25000,
  precio_dia: '35.00',
  reservable: true,
  ficha: emptyFacts(),
  moneda: 'USD',
  estado_operativo: 'operativo',
  descripcion: 'Sedán de demostración',
  imagen_url: null,
  categoria: { id: 1, nombre: 'Sedán' },
  marca: { id: 1, nombre: 'Toyota' },
  modelo: { id: 1, nombre: 'Corolla' },
  ubicacion: {
    id: 1,
    nombre: 'Sucursal de demostración A',
    tipo: 'sucursal',
    direccion: 'Dirección de demostración',
    latitud: '13.4833000',
    longitud: '-88.1833000',
  },
  disponible: null,
};
const catalogs: CatalogsData = {
  categorias: [{ id: 1, nombre: 'Sedán' }],
  marcas: [{ id: 1, nombre: 'Toyota' }],
  modelos: [{ id: 1, marca_id: 1, nombre: 'Corolla' }],
};

class FakeVehicleRepository implements VehicleRepository {
  readonly lists: VehicleFilters[] = [];
  readonly details: { id: number; periodo: CatalogPeriod | undefined }[] = [];
  catalogReads = 0;
  total = 1;
  vehicles: Vehicle[] = [defaultVehicle];
  detailVehicle: Vehicle | null = defaultVehicle;
  failure: Error | undefined;

  async list(filters: VehicleFilters): Promise<{ vehicles: Vehicle[]; total: number }> {
    this.lists.push(filters);
    if (this.failure) throw this.failure;
    return { vehicles: this.vehicles, total: this.total };
  }

  async findById(id: number, periodo?: CatalogPeriod): Promise<Vehicle | null> {
    this.details.push({ id, periodo });
    if (this.failure) throw this.failure;
    return this.detailVehicle;
  }

  async getCatalogs(): Promise<CatalogsData> {
    this.catalogReads += 1;
    if (this.failure) throw this.failure;
    return catalogs;
  }

  get calls(): number {
    return this.lists.length + this.details.length + this.catalogReads;
  }
}

async function startServer(t: TestContext, repository = new FakeVehicleRepository()): Promise<{
  url: string;
  repository: FakeVehicleRepository;
}> {
  const health = new HealthService({ async checkDatabase() {} });
  const server = createServer(createApp(health, undefined, new VehicleService(repository)));
  t.after(async () => {
    const closed = new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    await closed;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, repository };
}

function assertValidationFailure(callback: () => unknown): void {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    return true;
  });
}

function assertPublicError(body: unknown, code: string): void {
  assert.ok(body && typeof body === 'object');
  const envelope = body as Record<string, unknown>;
  assert.equal(envelope.success, false);
  assert.ok(envelope.error && typeof envelope.error === 'object');
  const error = envelope.error as Record<string, unknown>;
  assert.equal(error.code, code);
  assert.equal(typeof error.message, 'string');
  assert.ok((error.message as string).length > 0);
  assert.deepEqual(Object.keys(envelope).sort(), ['error', 'success']);
  assert.deepEqual(Object.keys(error).sort(), ['code', 'message']);
  assert.doesNotMatch(JSON.stringify(body), /SELECT password_hash|not-for-clients|password_hash|\bat\s+\w+.*\(/);
}

test('vehicle filters default to the first page of twenty with no date-based availability claim', () => {
  assert.deepEqual(parseVehicleFilters({}), { page: 1, limit: 20 });
  assert.equal(parseVehicleDetailQuery({}), undefined);
});

test('vehicle filters parse all supported filters without changing exact decimal prices', () => {
  assert.deepEqual(parseVehicleFilters({
    categoria_id: '1', marca_id: '2', modelo_id: '3', precio_min: '0.29', precio_max: '99999999.99',
    kilometraje_min: '0', kilometraje_max: '4294967295', page: '1000000', limit: '100',
  }), {
    categoriaId: 1, marcaId: 2, modeloId: 3, precioMin: '0.29', precioMax: '99999999.99',
    kilometrajeMin: 0, kilometrajeMax: 4294967295, page: 1000000, limit: 100,
  });
  assert.equal(parseVehicleFilters({ precio_min: '0', precio_max: '0.1' }).precioMin, '0.00');
  assert.equal(parseVehicleFilters({ precio_min: '0', precio_max: '0.1' }).precioMax, '0.10');
  assert.equal(parseVehicleFilters({ precio_min: '35', precio_max: '35.00' }).precioMin, '35.00');
  assert.equal(parseVehicleFilters({ precio_min: '0.29', precio_max: '0.30' }).precioMax, '0.30');
});

test('vehicle id accepts only canonical positive unsigned database ids', () => {
  assert.equal(parseVehicleId('1'), 1);
  assert.equal(parseVehicleId('4294967295'), 4294967295);
  for (const value of [undefined, null, [], {}, 1, '', '0', '-1', '+1', '01', '1.0', '1e2', ' 1', '1 ', '4294967296', '1 OR 1=1']) {
    assertValidationFailure(() => parseVehicleId(value));
  }
});

test('vehicle filters reject unknown keys, repeated values, nested values and malformed query containers', () => {
  for (const query of [
    null, [], 'texto', 42,
    { estado_operativo: 'mantenimiento' }, { disponible: 'true' }, { order_by: 'precio_dia' },
    { categoria_id: ['1', '2'] }, { precio_min: { amount: '35' } }, { page: 1 },
    { inicio: ['2026-11-10T14:00:00Z'], fin: '2026-11-11T14:00:00Z' },
  ]) {
    assertValidationFailure(() => parseVehicleFilters(query));
  }
});

test('vehicle identifier filters reject SQL fragments, empty values and noncanonical ids', () => {
  for (const name of ['categoria_id', 'marca_id', 'modelo_id']) {
    for (const value of ['', '0', '-1', '+1', '01', '1.0', '1e2', ' 1', '4294967296', "1' OR '1'='1"]) {
      assertValidationFailure(() => parseVehicleFilters({ [name]: value }));
    }
  }
});

test('vehicle price filters reject fractions of a cent, exponents and out-of-range money', () => {
  for (const name of ['precio_min', 'precio_max']) {
    for (const value of ['', '-1', '+1', '.99', '1.', '01.00', '00', '0.001', '1e2', 'NaN', 'Infinity', '100000000', ' 35', '35,00', '35 OR 1=1']) {
      assertValidationFailure(() => parseVehicleFilters({ [name]: value }));
    }
  }
  assertValidationFailure(() => parseVehicleFilters({ precio_min: '35.01', precio_max: '35' }));
});

test('vehicle mileage filters use unsigned integers and an ordered inclusive range', () => {
  assert.equal(parseVehicleFilters({ kilometraje_min: '0', kilometraje_max: '0' }).kilometrajeMax, 0);
  for (const name of ['kilometraje_min', 'kilometraje_max']) {
    for (const value of ['', '-1', '+1', '01', '0.5', '1e2', '4294967296', ' 1']) {
      assertValidationFailure(() => parseVehicleFilters({ [name]: value }));
    }
  }
  assertValidationFailure(() => parseVehicleFilters({ kilometraje_min: '11', kilometraje_max: '10' }));
});

test('vehicle pagination rejects unbounded and fractional result windows', () => {
  for (const [name, values] of [
    ['page', ['', '0', '-1', '01', '1.5', '1e2', '1000001']],
    ['limit', ['', '0', '-1', '01', '1.5', '1e2', '101']],
  ] as const) {
    for (const value of values) {
      assertValidationFailure(() => parseVehicleFilters({ [name]: value }));
    }
  }
});

test('vehicle periods normalize time zones and fractions to one exact UTC interval', () => {
  const period = parseVehicleDetailQuery({
    inicio: '2026-11-10T08:00:00.1-06:00',
    fin: '2026-11-11T16:00:00.12Z',
  });
  assert.deepEqual(period, {
    inicioUtc: '2026-11-10T14:00:00.100Z',
    finUtc: '2026-11-11T16:00:00.120Z',
    inicioSql: '2026-11-10 14:00:00.100',
    finSql: '2026-11-11 16:00:00.120',
  });
  assert.deepEqual(parseVehicleFilters({
    inicio: '2026-11-10T08:00:00.1-06:00', fin: '2026-11-11T16:00:00.12Z',
  }), { page: 1, limit: 20, periodo: period });
});

test('vehicle catalog previews permit past dates and real leap days without making a reservation', () => {
  const period = parseVehicleDetailQuery({ inicio: '2000-02-29T00:00:00Z', fin: '2000-03-01T00:00:00Z' });
  assert.equal(period?.inicioUtc, '2000-02-29T00:00:00.000Z');
  assert.equal(parseVehicleDetailQuery({
    inicio: '2028-02-29T00:00:00+14:00', fin: '2028-02-29T00:00:01+14:00',
  })?.inicioUtc, '2028-02-28T10:00:00.000Z');
});

test('vehicle periods reject one missing date, equal instants and reversed ranges', () => {
  for (const query of [
    { inicio: '2026-11-10T14:00:00Z' }, { fin: '2026-11-11T14:00:00Z' },
    { inicio: '2026-11-10T14:00:00Z', fin: '2026-11-10T08:00:00-06:00' },
    { inicio: '2026-11-11T14:00:00Z', fin: '2026-11-10T14:00:00Z' },
  ]) {
    assertValidationFailure(() => parseVehicleFilters(query));
    assertValidationFailure(() => parseVehicleDetailQuery(query));
  }
});

test('vehicle periods reject impossible calendar dates, ambiguous times and invalid timezone offsets', () => {
  const invalidDates = [
    '2026-02-29T14:00:00Z', '2100-02-29T14:00:00Z', '2026-11-31T14:00:00Z',
    '2026-00-10T14:00:00Z', '2026-13-10T14:00:00Z', '2026-11-00T14:00:00Z',
    '2026-11-10T24:00:00Z', '2026-11-10T14:60:00Z', '2026-11-10T14:00:60Z',
    '2026-11-10T14:00:00', '2026-11-10 14:00:00Z', '2026-11-10T14:00Z',
    '2026-11-10T14:00:00.0000Z', '2026-11-10T14:00:00+14:01', '2026-11-10T14:00:00+15:00',
    '2026-11-10T14:00:00+01:60', '2026-11-10T14:00:00-15:00',
    '0999-12-31T23:59:59Z', '1000-01-01T00:00:00+14:00', '9999-12-31T23:59:59-14:00',
    "2026-11-10T14:00:00Z' OR '1'='1",
  ];
  for (const inicio of invalidDates) {
    assertValidationFailure(() => parseVehicleDetailQuery({ inicio, fin: '9999-12-31T23:59:59Z' }));
  }
});

test('vehicle detail query accepts only its two date fields', () => {
  for (const query of [
    { page: '1' }, { categoria_id: '1' }, { precio_min: '35' }, { desconocido: 'x' },
    { inicio: ['2026-11-10T14:00:00Z'], fin: '2026-11-11T14:00:00Z' },
    { inicio: { fecha: '2026-11-10T14:00:00Z' }, fin: '2026-11-11T14:00:00Z' },
  ]) {
    assertValidationFailure(() => parseVehicleDetailQuery(query));
  }
});

test('GET vehicles is public and returns exact prices, useful location data and unknown availability without dates', async (t) => {
  const { url, repository } = await startServer(t);
  const response = await fetch(`${url}/api/v1/vehicles`, { headers: { authorization: 'Bearer invalid-but-public' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), {
    success: true,
    data: { vehicles: [defaultVehicle], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, periodo: null },
  });
  assert.deepEqual(repository.lists, [{ page: 1, limit: 20 }]);
});

test('GET vehicles forwards validated filters and computes pagination from the full filtered count', async (t) => {
  const repository = new FakeVehicleRepository();
  repository.total = 5;
  repository.vehicles = [{ ...defaultVehicle, disponible: true }];
  const { url } = await startServer(t, repository);
  const params = new URLSearchParams({
    categoria_id: '1', marca_id: '1', modelo_id: '1', precio_min: '30', precio_max: '40.5',
    kilometraje_min: '0', kilometraje_max: '30000', page: '2', limit: '2',
    inicio: '2026-11-10T08:00:00-06:00', fin: '2026-11-11T16:00:00Z',
  });
  const response = await fetch(`${url}/api/v1/vehicles?${params}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      vehicles: repository.vehicles,
      pagination: { page: 2, limit: 2, total: 5, totalPages: 3 },
      periodo: { inicio_utc: '2026-11-10T14:00:00.000Z', fin_utc: '2026-11-11T16:00:00.000Z' },
    },
  });
  assert.deepEqual(repository.lists, [{
    categoriaId: 1, marcaId: 1, modeloId: 1, precioMin: '30.00', precioMax: '40.50',
    kilometrajeMin: 0, kilometrajeMax: 30000, page: 2, limit: 2,
    periodo: {
      inicioUtc: '2026-11-10T14:00:00.000Z', finUtc: '2026-11-11T16:00:00.000Z',
      inicioSql: '2026-11-10 14:00:00.000', finSql: '2026-11-11 16:00:00.000',
    },
  }]);
});

test('GET vehicles returns an empty result with zero pages when no operational vehicles match', async (t) => {
  const repository = new FakeVehicleRepository();
  repository.vehicles = [];
  repository.total = 0;
  const { url } = await startServer(t, repository);
  const response = await fetch(`${url}/api/v1/vehicles?categoria_id=4294967295`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { vehicles: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, periodo: null },
  });
});

test('GET vehicles rejects malformed query values before consulting the repository', async (t) => {
  const { url, repository } = await startServer(t);
  for (const query of [
    'categoria_id=1&categoria_id=2', 'categoria_id%5B%5D=1', 'precio_min%5Bvalor%5D=35',
    'estado_operativo=mantenimiento', 'page=0', 'limit=101', 'precio_min=35.001',
    'precio_min=40&precio_max=35', 'kilometraje_min=20&kilometraje_max=10',
    'categoria_id=1%20OR%201%3D1', 'inicio=2026-11-10T14%3A00%3A00Z',
  ]) {
    const response = await fetch(`${url}/api/v1/vehicles?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertPublicError(await response.json(), 'VALIDATION_ERROR');
  }
  assert.equal(repository.calls, 0);
});

test('GET vehicle detail is public and does not invent availability without a period', async (t) => {
  const { url, repository } = await startServer(t);
  const response = await fetch(`${url}/api/v1/vehicles/1`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { success: true, data: { vehicle: defaultVehicle, periodo: null } });
  assert.deepEqual(repository.details, [{ id: 1, periodo: undefined }]);
});

test('GET vehicle detail can describe an operational vehicle that is unavailable for the requested dates', async (t) => {
  const repository = new FakeVehicleRepository();
  repository.detailVehicle = { ...defaultVehicle, disponible: false };
  const { url } = await startServer(t, repository);
  const params = new URLSearchParams({ inicio: '2026-11-10T14:00:00Z', fin: '2026-11-11T16:00:00Z' });
  const response = await fetch(`${url}/api/v1/vehicles/1?${params}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      vehicle: repository.detailVehicle,
      periodo: { inicio_utc: '2026-11-10T14:00:00.000Z', fin_utc: '2026-11-11T16:00:00.000Z' },
    },
  });
  assert.equal(repository.details[0]?.periodo?.inicioSql, '2026-11-10 14:00:00.000');
});

test('GET vehicle detail returns the same safe 404 when an id is absent from the operational catalog', async (t) => {
  const repository = new FakeVehicleRepository();
  repository.detailVehicle = null;
  const { url } = await startServer(t, repository);
  const response = await fetch(`${url}/api/v1/vehicles/6`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assertPublicError(await response.json(), 'VEHICLE_NOT_FOUND');
  assert.deepEqual(repository.details, [{ id: 6, periodo: undefined }]);
});

test('GET vehicle detail rejects invalid ids, unknown query fields and duplicate dates without database work', async (t) => {
  const { url, repository } = await startServer(t);
  for (const suffix of [
    '0', '01', '4294967296', '1%20OR%201%3D1', '1?categoria_id=1', '1?page=1',
    '1?inicio=x&inicio=y&fin=z', '1?inicio=2026-02-30T14%3A00%3A00Z&fin=2026-03-01T14%3A00%3A00Z',
  ]) {
    const response = await fetch(`${url}/api/v1/vehicles/${suffix}`);
    assert.equal(response.status, 400, suffix);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertPublicError(await response.json(), 'VALIDATION_ERROR');
  }
  assert.equal(repository.calls, 0);
});

test('GET catalogs exposes public filter options including the model to brand relationship', async (t) => {
  const { url, repository } = await startServer(t);
  const response = await fetch(`${url}/api/v1/catalogs`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { success: true, data: catalogs });
  assert.equal(repository.catalogReads, 1);
});

test('public catalog routes do not permit vehicle mutations', async (t) => {
  const { url, repository } = await startServer(t);
  for (const [path, method] of [['vehicles', 'POST'], ['vehicles/1', 'PATCH'], ['vehicles/1', 'DELETE'], ['catalogs', 'POST']] as const) {
    const response = await fetch(`${url}/api/v1/${path}`, { method });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertPublicError(await response.json(), 'NOT_FOUND');
  }
  assert.equal(repository.calls, 0);
});

test('public catalog resources preserve safe database-unavailable errors', async (t) => {
  const repository = new FakeVehicleRepository();
  repository.failure = new ApiError(503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible temporalmente.', {
    cause: new Error(privateDiagnostic),
  });
  const { url } = await startServer(t, repository);
  for (const route of ['vehicles', 'vehicles/1', 'catalogs']) {
    const response = await fetch(`${url}/api/v1/${route}`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assertPublicError(await response.json(), 'DATABASE_UNAVAILABLE');
  }
});

test('unexpected catalog failures return a generic public error without SQL or credentials', async (t) => {
  const repository = new FakeVehicleRepository();
  repository.failure = new Error(privateDiagnostic);
  const { url } = await startServer(t, repository);
  const response = await fetch(`${url}/api/v1/vehicles`);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assertPublicError(await response.json(), 'INTERNAL_SERVER_ERROR');
});
