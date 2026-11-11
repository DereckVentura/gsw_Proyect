import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { HealthService } from '../src/services/health.service.js';
import { VehicleService } from '../src/services/vehicle.service.js';

test('la ruta adaptada de Clase 19 utiliza filtros y servicio de vehículos', async () => {
  let queried = false;
  const vehicles = new VehicleService({
    list: async (filters) => {
      assert.equal(filters.precioMax, '60.00');
      queried = true;
      return { vehicles: [], total: 0 };
    },
    findById: async () => null,
    getCatalogs: async () => ({}) as never,
  });
  const server = createApp(new HealthService({ checkDatabase: async () => {} }), undefined, vehicles).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address(); assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/api/vehiculos?precio_max=60`);
    assert.equal(response.status, 200);
    assert.equal(queried, true);
    const body = await response.json() as { data: { vehicles: unknown[] } };
    assert.deepEqual(body.data.vehicles, []);
    assert.equal((await fetch(`${base}/api/vehiculos/999`)).status, 404);
    assert.equal((await fetch(`${base}/api/vehiculos?precio_max=invalido`)).status, 400);
    const info = await (await fetch(`${base}/api/info`)).json() as { servicio: string };
    assert.equal(info.servicio, 'AutoRent - Rent a Car Molina');
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
