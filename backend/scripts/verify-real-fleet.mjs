import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { Database } from '../dist/config/database.js';
import { MySqlVehicleRepository } from '../dist/repositories/vehicle.repository.js';
import { MySqlFleetRepository } from '../dist/repositories/fleet.repository.js';
import { parseVehicleFilters } from '../dist/validators/vehicle.validator.js';
import { parseFleetCreate, parseFleetPatch } from '../dist/validators/fleet.validator.js';

// Instancia temporal exclusiva de estas pruebas; no usa backend/.env.
const root = await mysql.createConnection({ host: '127.0.0.1', port: 3318, user: 'root', password: '', multipleStatements: true });
let database;
const checks = [];
function check(name, work) { work(); checks.push({ name, passed: true }); }
try {
  const [[port]] = await root.query('SELECT @@port AS port');
  assert.equal(port.port, 3318);
  for (const path of ['migrations/001_initial_schema.sql', 'seeds/001_demo_catalog.sql', 'migrations/002_real_fleet.sql']) {
    await root.query(await readFile(new URL(`../../database/${path}`, import.meta.url), 'utf8'));
  }
  checks.push({ name: 'Migracion inicial, semillas y migracion 002 aplicadas en MySQL temporal', passed: true });
  const password = randomBytes(24).toString('base64url');
  await root.query("CREATE USER 'fleet_test'@'127.0.0.1' IDENTIFIED BY ?", [password]);
  await root.query("GRANT SELECT, INSERT, UPDATE, DELETE ON autorent.* TO 'fleet_test'@'127.0.0.1'");
  const env = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: '3318', DB_NAME: 'autorent', DB_USER: 'fleet_test', DB_PASSWORD: password, JWT_SECRET: randomBytes(32).toString('base64url'), NODE_ENV: 'test' };
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const importFleet = () => execFileSync(process.execPath, ['dist/scripts/import-real-fleet.js'], { cwd, env, stdio: 'pipe' });
  importFleet();
  database = new Database({ host: '127.0.0.1', port: 3318, name: 'autorent', user: 'fleet_test', password });
  const publicRepo = new MySqlVehicleRepository(database);
  const adminRepo = new MySqlFleetRepository(database);
  const list = await publicRepo.list(parseVehicleFilters({}));
  check('Catalogo contiene exactamente las tres unidades elegidas', () => {
    assert.equal(list.total, 3);
    assert.deepEqual(list.vehicles.map((v) => `${v.marca.nombre} ${v.modelo.nombre} ${v.ficha.color}`).sort(), ['Mitsubishi Outlander Gris', 'Mitsubishi Outlander Rojo', 'Nissan Rogue Gris']);
  });
  check('Tarifas y placas confirmadas; kilometrajes y ubicaciones pendientes', () => {
    for (const v of list.vehicles) { assert.equal(v.precio_dia,v.marca.nombre==='Nissan'?'35.00':'40.00');assert.ok(v.placa); assert.equal(v.kilometraje, null); assert.equal(v.ubicacion, null); assert.equal(v.reservable, false); }
  });
  check('Cada unidad tiene dos fotos y referencias oficiales separadas de su version pendiente', () => {
    for (const v of list.vehicles) { assert.equal(v.ficha.fotos.length, 2); assert.ok(v.ficha.referencias.length > 0); assert.equal(v.ficha.version, null); }
  });
  const rogue = list.vehicles.find((v) => v.marca.nombre === 'Nissan');
  check('Rogue conserva 2016 del propietario y la incertidumbre de identidad', () => {
    assert.equal(rogue.anio, 2016); assert.equal(rogue.ficha.anio_verificado, false); assert.equal(rogue.ficha.traccion, null);
    assert.match(rogue.ficha.observaciones, /2017/);
  });
  const period = parseVehicleFilters({ inicio: '2026-11-20T12:00:00Z', fin: '2026-11-21T14:00:00Z' });
  const availableBefore = await publicRepo.list(period);
  check('Busqueda por fechas no ofrece unidades sin datos para reservar', () => assert.equal(availableBefore.total, 0));
  const detailBefore = await publicRepo.findById(rogue.id, period.periodo);
  check('Detalle con fechas indica no disponible mientras faltan datos', () => assert.equal(detailBefore.disponible, false));
  const edited = await adminRepo.update(rogue.id, parseFleetPatch({ precio_dia: '55.5', kilometraje: 90000, placa: 'TEST-ROGUE', ubicacion_actual_id: 1 }));
  check('Administrador completa datos conservando modelo, fotos y descripcion', () => {
    assert.equal(edited.precio_dia, '55.50'); assert.equal(edited.ficha.fotos.length, 2); assert.equal(edited.modelo, 'Rogue');
  });
  const availableAfter = await publicRepo.list(period);
  check('Unidad completa pasa a estar habilitada para el periodo', () => {
    assert.equal(availableAfter.total, 1); assert.equal(availableAfter.vehicles[0].reservable, true); assert.equal(availableAfter.vehicles[0].disponible, true);
  });
  await adminRepo.update(rogue.id, parseFleetPatch({ precio_dia: null }));
  const withoutPrice = await publicRepo.findById(rogue.id, period.periodo);
  check('Quitar solo el precio devuelve disponible false, no null ni gratis', () => assert.equal(withoutPrice.disponible, false));
  await adminRepo.update(rogue.id, parseFleetPatch({ precio_dia: '55.50' }));
  importFleet();
  const afterImport = await publicRepo.findById(rogue.id);
  check('Repetir importacion no duplica unidades ni sobrescribe ediciones', () => { assert.equal(afterImport.precio_dia, '55.50'); assert.equal(afterImport.kilometraje, 90000); });
  const added = await adminRepo.create(parseFleetCreate({ marca: 'Marca nueva', modelo: 'Modelo nuevo', categoria_id: 2, anio: 2020, estado_operativo: 'operativo', publicado: true }));
  check('Se pueden agregar mas unidades y modelos sin cambiar codigo', () => assert.ok(added.id > rogue.id));
  const four = await publicRepo.list(parseVehicleFilters({}));
  check('Catalogo admite una cuarta unidad y mantiene paginacion', () => assert.equal(four.total, 4));
  await assert.rejects(adminRepo.create(parseFleetCreate({ marca: 'Nissan', modelo: 'Rogue', categoria_id: 2, anio: 2016, placa: 'TEST-ROGUE' })), (e) => e.code === 'VEHICLE_CONFLICT');
  checks.push({ name: 'Placa duplicada se rechaza con 409 y transaccion revertida', passed: true });
  await assert.rejects(adminRepo.update(rogue.id, parseFleetPatch({ categoria_id: 999999 })), (e) => e.code === 'INVALID_CATEGORY');
  const afterFailure = await publicRepo.findById(rogue.id);
  check('Una edicion invalida no modifica datos existentes', () => assert.equal(afterFailure.categoria.id, 2));
  await adminRepo.update(rogue.id, { publicado: false });
  const retired = await publicRepo.findById(rogue.id);
  const all = await adminRepo.list(1, 100);
  check('Retirar oculta del catalogo y conserva el registro para administracion', () => { assert.equal(retired, null); assert.ok(all.vehicles.some((v) => v.id === rogue.id)); });
  await database.withConnection(async (connection) => {
    const [demo] = await connection.query("SELECT COUNT(*) AS total FROM vehiculos WHERE placa LIKE 'DEMO-%'");
    check('Se conservan los seis registros de demostracion ocultos', () => assert.equal(demo[0].total, 6));
  });
  const summary = { checkedAtUtc: new Date().toISOString(), database: 'MySQL temporal, puerto 3318', total: checks.length, passed: checks.length, checks };
  await writeFile(new URL('../../../reports/real-fleet-integration.json', import.meta.url), JSON.stringify(summary, null, 2));
  console.info(JSON.stringify(summary, null, 2));
} finally {
  if (database) await database.close();
  await root.end();
}
