import { readFile } from 'node:fs/promises';
import type { RowDataPacket } from 'mysql2/promise';
import { Database } from '../config/database.js';
import { parseDeployment } from '../config/deployment.js';
import { loadEnvironment } from '../config/env.js';
import { parseFleetCreate } from '../validators/fleet.validator.js';

interface IdRow extends RowDataPacket { id: number }

const config = loadEnvironment();
const database = new Database(config.database, parseDeployment(process.env));
try {
  const manifest = JSON.parse(await readFile(new URL('../../../database/data/real-fleet.json', import.meta.url), 'utf8')) as {
    vehicles: Array<Record<string, unknown> & { codigo_interno: string; categoria: string }>;
  };
  // Validar todo antes de abrir la transacción o modificar el catálogo.
  const inputs = manifest.vehicles.map(({ codigo_interno, categoria, ...input }) => ({
    code: codigo_interno, category: categoria, input: parseFleetCreate({ ...input, categoria_id: 1 }),
  }));
  if (inputs.length !== 3 || inputs.map((item) => item.code).sort().join(',') !== 'OUTLANDER-GRIS,OUTLANDER-ROJA,ROGUE-GRIS') throw new Error('INVALID_FLEET_SELECTION');
  await database.withConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      for (const { code, category, input } of inputs) {
        const [existing] = await connection.execute<IdRow[]>('SELECT id FROM vehiculos WHERE codigo_interno = ? FOR UPDATE', [code]);
        // Repetir el importador conserva los datos editados por el administrador.
        if (existing.length > 0) continue;
        await connection.execute('INSERT INTO marcas (nombre) VALUES (?) ON DUPLICATE KEY UPDATE id = id', [input.marca]);
        const [brands] = await connection.execute<IdRow[]>('SELECT id FROM marcas WHERE nombre = ?', [input.marca]);
        const brandId = brands[0]?.id;
        if (brandId === undefined) throw new Error('BRAND_NOT_FOUND');
        await connection.execute('INSERT INTO modelos (marca_id, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id', [brandId, input.modelo]);
        const [models] = await connection.execute<IdRow[]>('SELECT id FROM modelos WHERE marca_id = ? AND nombre = ?', [brandId, input.modelo]);
        const [categories] = await connection.execute<IdRow[]>('SELECT id FROM categorias WHERE nombre = ? AND activo = TRUE', [category]);
        if (models[0] === undefined || categories[0] === undefined) throw new Error('CATALOG_OPTION_NOT_FOUND');
        await connection.execute(
          `INSERT INTO vehiculos (codigo_interno, placa, categoria_id, modelo_id, ubicacion_actual_id,
            anio, kilometraje, precio_dia, estado_operativo, publicado, descripcion, imagen_url, ficha)
           VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, TRUE, ?, ?, ?)`,
          [code, input.placa, categories[0].id, models[0].id, input.anio, input.precio_dia, input.estado_operativo,
            input.descripcion, input.ficha.fotos[0]?.url ?? null, JSON.stringify(input.ficha)],
        );
      }
      // El propietario eligió ver únicamente esas tres unidades. Se conserva el historial.
      await connection.execute(`UPDATE vehiculos SET publicado = FALSE
        WHERE codigo_interno IS NULL OR codigo_interno NOT IN (?, ?, ?)`, inputs.map((item) => item.code));
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
  });
  console.info('[autorent-api] Flota importada: Outlander gris, Outlander roja y Rogue gris. Rogue azul excluida.');
  console.info('[autorent-api] Tarifas y placas confirmadas por el propietario. Completa kilometraje y ubicación para habilitar las reservas.');
} catch {
  console.error('[autorent-api] FLEET_IMPORT_FAILED. Revisa que la migración 002 esté aplicada y que exista la categoría SUV.');
  process.exitCode = 1;
} finally { await database.close(); }
