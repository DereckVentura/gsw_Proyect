import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';
import type { CreateClientInput, StoredUser, User, UserRole } from '../models/user.model.js';
import { ApiError } from '../utils/api-error.js';
import { storeAcceptance } from '../services/legal.service.js';

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: number): Promise<StoredUser | null>;
  createClient(input: CreateClientInput): Promise<User>;
}

interface UserRow extends RowDataPacket {
  id: number;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  rol: UserRole;
  password_hash: string;
  activo: number;
}

const USER_COLUMNS = 'id, nombres, apellidos, email, telefono, rol, password_hash, activo';

function toStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    nombres: row.nombres,
    apellidos: row.apellidos,
    email: row.email,
    telefono: row.telefono,
    rol: row.rol,
    passwordHash: row.password_hash,
    activo: row.activo === 1,
  };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export class MySqlUserRepository implements UserRepository {
  constructor(private readonly database: DatabaseConnectionProvider) {}

  async findByEmail(email: string): Promise<StoredUser | null> {
    return this.run(async () => this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<UserRow[]>(
        `SELECT ${USER_COLUMNS} FROM usuarios WHERE email = ? LIMIT 1`,
        [email],
      );
      const row = rows[0];
      return row === undefined ? null : toStoredUser(row);
    }));
  }

  async findById(id: number): Promise<StoredUser | null> {
    return this.run(async () => this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<UserRow[]>(
        `SELECT ${USER_COLUMNS} FROM usuarios WHERE id = ? LIMIT 1`,
        [id],
      );
      const row = rows[0];
      return row === undefined ? null : toStoredUser(row);
    }));
  }

  async createClient(input: CreateClientInput): Promise<User> {
    return this.run(async () => this.database.withConnection(async (connection) => {
      // El registro público siempre crea un cliente activo. El cuerpo HTTP no decide el rol.
      await connection.beginTransaction();
      try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO usuarios (nombres, apellidos, email, password_hash, telefono, rol, activo)
         VALUES (?, ?, ?, ?, ?, 'cliente', TRUE)`,
        [input.nombres, input.apellidos, input.email, input.passwordHash, input.telefono],
      );
      if (input.acceptance) await storeAcceptance(connection, result.insertId, 'registro', input.acceptance);
      await connection.commit();
      return {
        id: result.insertId,
        nombres: input.nombres,
        apellidos: input.apellidos,
        email: input.email,
        telefono: input.telefono,
        rol: 'cliente',
      };
      } catch (error) { await connection.rollback(); throw error; }
    }), true);
  }

  private async run<T>(operation: () => Promise<T>, inserting = false): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // La clave única también protege dos registros simultáneos del mismo correo.
      if (inserting && hasErrorCode(error, 'ER_DUP_ENTRY')) {
        throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe una cuenta con ese correo electrónico.');
      }
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible. Intenta nuevamente más tarde.', { cause: error });
    }
  }
}
