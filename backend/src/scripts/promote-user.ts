import { Database } from '../config/database.js';
import { loadEnvironment } from '../config/env.js';
import { MySqlUserRepository } from '../repositories/user.repository.js';
import type { ResultSetHeader } from 'mysql2/promise';
import { parseEmail } from '../validators/auth.validator.js';
import { parseDeployment } from '../config/deployment.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--email') {
    console.error('[autorent-api] Uso: npm.cmd run user:promote -- --email "correo de un usuario registrado"');
    process.exitCode = 1;
    return;
  }
  let email: string;
  try {
    email = parseEmail(args[1]);
  } catch {
    console.error('[autorent-api] Introduce un correo electrónico válido.');
    process.exitCode = 1;
    return;
  }
  const config = loadEnvironment();
  const database = new Database(config.database, parseDeployment(process.env));
  try {
    const user = await new MySqlUserRepository(database).findByEmail(email);
    if (user === null || !user.activo) {
      console.error('[autorent-api] El usuario debe estar registrado y activo antes de asignarle el rol.');
      process.exitCode = 1;
      return;
    }
    if (user.rol === 'administrador') {
      console.info('[autorent-api] El usuario ya tiene el rol administrador.');
      return;
    }
    const affected = await database.withConnection(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE usuarios SET rol = 'administrador' WHERE id = ? AND activo = TRUE AND rol = 'cliente'",
        [user.id],
      );
      return result.affectedRows;
    });
    if (affected !== 1) {
      throw new Error('USER_CHANGED');
    }
    console.info('[autorent-api] Rol administrador asignado al usuario indicado.');
  } finally {
    await database.close();
  }
}

// Esta herramienta solo se ejecuta localmente; no existe una ruta pública de promoción.
main().catch(() => {
  console.error('[autorent-api] USER_PROMOTION_ERROR. Revisa la configuración y la disponibilidad de MySQL.');
  process.exitCode = 1;
});
