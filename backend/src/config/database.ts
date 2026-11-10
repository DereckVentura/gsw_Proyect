import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';
import type { AppConfig } from './env.js';
import type { DeploymentConfig } from './deployment.js';

export interface DatabaseConnectionProvider {
  withConnection<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
}

export class Database implements DatabaseConnectionProvider {
  private readonly pool: Pool;
  private closing: Promise<void> | undefined;

  constructor(config: AppConfig['database'], deployment?: Pick<DeploymentConfig, 'poolSize' | 'ssl'>) {
    this.pool = createPool({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      waitForConnections: true,
      connectionLimit: deployment?.poolSize ?? 5,
      queueLimit: 20,
      connectTimeout: 5_000,
      timezone: 'Z',
      dateStrings: true,
      decimalNumbers: false,
      multipleStatements: false,
      ...(deployment?.ssl ? { ssl: deployment.ssl } : {}),
      charset: 'utf8mb4',
    });
  }

  async withConnection<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      // Cada sesión debe trabajar en UTC, aunque MySQL tenga otra zona predeterminada.
      await connection.query("SET time_zone = '+00:00'");
      return await work(connection);
    } finally {
      connection.release();
    }
  }

  close(): Promise<void> {
    // Compartir la promesa evita cerrar el mismo pool dos veces al recibir señales.
    this.closing ??= this.pool.end();
    return this.closing;
  }
}
