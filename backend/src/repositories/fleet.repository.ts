import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';
import type { AdminVehicle, FleetInput, FleetPatch } from '../models/fleet.model.js';
import { emptyFacts } from '../models/fleet.model.js';
import { ApiError } from '../utils/api-error.js';

export interface FleetRepository {
  list(page: number, limit: number): Promise<{ vehicles: AdminVehicle[]; total: number }>;
  create(input: FleetInput): Promise<AdminVehicle>;
  update(id: number, patch: FleetPatch): Promise<AdminVehicle>;
}

interface FleetRow extends RowDataPacket, Omit<AdminVehicle, 'publicado'> { publicado: number }
interface IdRow extends RowDataPacket { id: number }
interface CountRow extends RowDataPacket { total: number }

const SELECT = `SELECT v.id, v.codigo_interno, v.placa, v.categoria_id, v.anio,
  v.kilometraje, v.precio_dia, v.ubicacion_actual_id, v.estado_operativo,
  v.publicado, v.descripcion, v.ficha, ma.id AS marca_id, ma.nombre AS marca,
  mo.id AS modelo_id, mo.nombre AS modelo
  FROM vehiculos v JOIN modelos mo ON mo.id = v.modelo_id
  JOIN marcas ma ON ma.id = mo.marca_id`;

function vehicle(row: FleetRow): AdminVehicle {
  return { ...row, publicado: Boolean(row.publicado), ficha: row.ficha ?? emptyFacts() };
}

async function read(connection: PoolConnection, id: number): Promise<AdminVehicle> {
  const [rows] = await connection.execute<FleetRow[]>(`${SELECT} WHERE v.id = ?`, [id]);
  if (rows[0] === undefined) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'El vehículo no existe.');
  return vehicle(rows[0]);
}

async function modelId(connection: PoolConnection, brand: string, model: string): Promise<number> {
  await connection.execute('INSERT INTO marcas (nombre) VALUES (?) ON DUPLICATE KEY UPDATE id = id', [brand]);
  const [brands] = await connection.execute<IdRow[]>('SELECT id FROM marcas WHERE nombre = ? AND activo = TRUE', [brand]);
  const brandId = brands[0]?.id;
  if (brandId === undefined) throw new ApiError(400, 'INACTIVE_BRAND', 'La marca está desactivada.');
  await connection.execute('INSERT INTO modelos (marca_id, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id', [brandId, model]);
  const [models] = await connection.execute<IdRow[]>('SELECT id FROM modelos WHERE marca_id = ? AND nombre = ?', [brandId, model]);
  const id = models[0]?.id;
  if (id === undefined) throw new Error('MODEL_LOOKUP_FAILED');
  return id;
}

async function validateReferences(connection: PoolConnection, input: FleetInput): Promise<void> {
  const [categories] = await connection.execute<IdRow[]>('SELECT id FROM categorias WHERE id = ? AND activo = TRUE', [input.categoria_id]);
  if (categories.length === 0) throw new ApiError(400, 'INVALID_CATEGORY', 'Selecciona una categoría activa.');
  if (input.ubicacion_actual_id !== null) {
    const [locations] = await connection.execute<IdRow[]>('SELECT id FROM ubicaciones WHERE id = ? AND activo = TRUE', [input.ubicacion_actual_id]);
    if (locations.length === 0) throw new ApiError(400, 'INVALID_LOCATION', 'Selecciona una ubicación activa.');
  }
}

export class MySqlFleetRepository implements FleetRepository {
  constructor(private readonly database: DatabaseConnectionProvider) {}

  async list(page: number, limit: number): Promise<{ vehicles: AdminVehicle[]; total: number }> {
    return this.run(() => this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<FleetRow[]>(`${SELECT} ORDER BY v.id ASC LIMIT ? OFFSET ?`, [limit, (page - 1) * limit]);
      const [counts] = await connection.execute<CountRow[]>('SELECT COUNT(*) AS total FROM vehiculos');
      return { vehicles: rows.map(vehicle), total: counts[0]?.total ?? 0 };
    }));
  }

  async create(input: FleetInput): Promise<AdminVehicle> {
    return this.transaction(async (connection) => {
      await validateReferences(connection, input);
      const model = await modelId(connection, input.marca, input.modelo);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO vehiculos (placa, categoria_id, modelo_id, ubicacion_actual_id, anio,
          kilometraje, precio_dia, estado_operativo, publicado, descripcion, imagen_url, ficha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.placa, input.categoria_id, model, input.ubicacion_actual_id, input.anio,
          input.kilometraje, input.precio_dia, input.estado_operativo, input.publicado,
          input.descripcion, input.ficha.fotos[0]?.url ?? null, JSON.stringify(input.ficha)],
      );
      return read(connection, result.insertId);
    });
  }

  async update(id: number, patch: FleetPatch): Promise<AdminVehicle> {
    return this.transaction(async (connection) => {
      const [locked] = await connection.execute<IdRow[]>('SELECT id FROM vehiculos WHERE id = ? FOR UPDATE', [id]);
      if (locked.length === 0) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'El vehículo no existe.');
      const current = await read(connection, id);
      const input: FleetInput = { ...current, ...patch };
      if (current.kilometraje !== null && (input.kilometraje === null || input.kilometraje < current.kilometraje)) throw new ApiError(409, 'MILEAGE_DECREASE', 'El kilometraje no puede reducirse ni borrarse.');
      const [active] = await connection.execute<IdRow[]>("SELECT id, estado FROM reservas WHERE vehiculo_id = ? AND (estado = 'en_curso' OR (estado = 'confirmada' AND fin_utc > UTC_TIMESTAMP(6))) LIMIT 1 FOR UPDATE", [id]);
      if (active.length) {
        const identityChanged = ['marca', 'modelo', 'anio', 'placa'].some((key) => input[key as keyof FleetInput] !== current[key as keyof FleetInput]);
        if (identityChanged || input.estado_operativo !== current.estado_operativo || input.ubicacion_actual_id !== current.ubicacion_actual_id || input.kilometraje !== current.kilometraje) throw new ApiError(409, 'ACTIVE_RESERVATIONS', 'Este vehículo tiene reservas o alquileres activos. Registra la devolución o cancela las reservas antes de cambiar su identidad, estado, ubicación o kilometraje.');
      }
      await validateReferences(connection, input);
      const model = await modelId(connection, input.marca, input.modelo);
      await connection.execute(
        `UPDATE vehiculos SET placa = ?, categoria_id = ?, modelo_id = ?, ubicacion_actual_id = ?,
          anio = ?, kilometraje = ?, precio_dia = ?, estado_operativo = ?, publicado = ?,
          descripcion = ?, imagen_url = ?, ficha = ? WHERE id = ?`,
        [input.placa, input.categoria_id, model, input.ubicacion_actual_id, input.anio,
          input.kilometraje, input.precio_dia, input.estado_operativo, input.publicado,
          input.descripcion, input.ficha.fotos[0]?.url ?? null, JSON.stringify(input.ficha), id],
      );
      return read(connection, id);
    });
  }

  private transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    return this.run(() => this.database.withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }));
  }

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
      if (code === 'ER_DUP_ENTRY') throw new ApiError(409, 'VEHICLE_CONFLICT', 'Ya existe un vehículo con esa placa.');
      if (code === 'ER_NO_REFERENCED_ROW_2') throw new ApiError(400, 'INVALID_REFERENCE', 'Revisa la categoría y la ubicación del vehículo.');
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible. Intenta nuevamente más tarde.', { cause });
    }
  }
}
