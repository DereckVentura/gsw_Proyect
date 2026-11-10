import { Database } from '../dist/config/database.js';
import { loadEnvironment } from '../dist/config/env.js';

const database = new Database(loadEnvironment().database);
try {
  const total = await database.withConnection(async (connection) => {
    const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehiculos'
      AND COLUMN_NAME IN ('codigo_interno', 'publicado', 'ficha')`);
    return Number(rows[0].total);
  });
  if (total === 0) process.exitCode = 2;
  else if (total === 3) process.exitCode = 0;
  else {
    console.error('La migración de la flota está incompleta. Conserva el error para revisarlo.');
    process.exitCode = 1;
  }
} catch {
  console.error('No se pudo comprobar MySQL. Revisa que MySQL84 esté iniciado y conserva tu configuración local.');
  process.exitCode = 1;
} finally { await database.close(); }
