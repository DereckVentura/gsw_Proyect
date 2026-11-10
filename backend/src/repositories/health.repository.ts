import type { RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';

export interface HealthRepository {
  checkDatabase(): Promise<void>;
}

interface ConnectionCheckRow extends RowDataPacket {
  connected: number;
}

export class MySqlHealthRepository implements HealthRepository {
  constructor(private readonly database: DatabaseConnectionProvider) {}

  async checkDatabase(): Promise<void> {
    await this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<ConnectionCheckRow[]>('SELECT 1 AS connected');
      if (rows.length !== 1 || rows[0]?.connected !== 1) {
        throw new Error('La comprobación de conexión no devolvió el resultado esperado.');
      }
    });
  }
}
