import type { RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';
import type {
  CatalogPeriod,
  CatalogsData,
  Vehicle,
  VehicleFilters,
  VehicleList,
} from '../models/vehicle.model.js';
import { ApiError } from '../utils/api-error.js';
import { emptyFacts } from '../models/fleet.model.js';

export interface VehicleRepository {
  list(filters: VehicleFilters): Promise<VehicleList>;
  findById(id: number, periodo?: CatalogPeriod): Promise<Vehicle | null>;
  getCatalogs(): Promise<CatalogsData>;
}

interface VehicleRow extends RowDataPacket {
  id: number;
  placa: string | null;
  anio: number;
  kilometraje: number | null;
  precio_dia: string | null;
  ficha: Vehicle['ficha'] | null;
  reservable: number;
  descripcion: string | null;
  imagen_url: string | null;
  categoria_id: number;
  categoria_nombre: string;
  marca_id: number;
  marca_nombre: string;
  modelo_id: number;
  modelo_nombre: string;
  ubicacion_id: number;
  ubicacion_nombre: string;
  ubicacion_tipo: NonNullable<Vehicle['ubicacion']>['tipo'];
  ubicacion_direccion: string;
  ubicacion_latitud: string;
  ubicacion_longitud: string;
  disponible: number | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface CatalogRow extends RowDataPacket {
  id: number;
  nombre: string;
}

interface ModelRow extends CatalogRow {
  marca_id: number;
}

type SqlParameter = string | number;

const RENTAL_READY = `v.placa IS NOT NULL AND v.kilometraje IS NOT NULL
  AND v.precio_dia IS NOT NULL AND v.precio_dia > 0 AND v.ubicacion_actual_id IS NOT NULL`;

const VEHICLE_COLUMNS = `
  v.id, v.placa, v.anio, v.kilometraje, v.precio_dia,
  v.descripcion, v.imagen_url, v.ficha,
  (${RENTAL_READY}) AS reservable,
  c.id AS categoria_id, c.nombre AS categoria_nombre,
  ma.id AS marca_id, ma.nombre AS marca_nombre,
  mo.id AS modelo_id, mo.nombre AS modelo_nombre,
  u.id AS ubicacion_id, u.nombre AS ubicacion_nombre,
  u.tipo AS ubicacion_tipo, u.direccion AS ubicacion_direccion,
  u.latitud AS ubicacion_latitud, u.longitud AS ubicacion_longitud`;

const VEHICLE_JOINS = `
  FROM vehiculos v
  INNER JOIN categorias c ON c.id = v.categoria_id
  INNER JOIN modelos mo ON mo.id = v.modelo_id
  INNER JOIN marcas ma ON ma.id = mo.marca_id
  LEFT JOIN ubicaciones u ON u.id = v.ubicacion_actual_id`;

const PUBLIC_ELIGIBILITY = `
  v.estado_operativo = 'operativo' AND v.publicado = TRUE
  AND c.activo = TRUE AND ma.activo = TRUE
  AND (v.ubicacion_actual_id IS NULL OR u.activo = TRUE)`;

// Las comparaciones estrictas permiten que una reserva comience
// exactamente cuando termina otra. Canceladas, completadas y no_presentado no bloquean.
const AVAILABLE_FOR_PERIOD = `NOT EXISTS (
  SELECT 1 FROM reservas r
  WHERE r.vehiculo_id = v.id
    AND r.estado IN ('confirmada', 'en_curso')
    AND ? < r.fin_utc AND ? > r.inicio_utc
)`;

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    placa: row.placa,
    anio: row.anio,
    kilometraje: row.kilometraje,
    precio_dia: row.precio_dia,
    reservable: row.reservable === 1,
    ficha: row.ficha ?? emptyFacts(),
    moneda: 'USD',
    estado_operativo: 'operativo',
    descripcion: row.descripcion,
    imagen_url: row.imagen_url,
    categoria: { id: row.categoria_id, nombre: row.categoria_nombre },
    marca: { id: row.marca_id, nombre: row.marca_nombre },
    modelo: { id: row.modelo_id, nombre: row.modelo_nombre },
    ubicacion: row.ubicacion_id === null ? null : {
      id: row.ubicacion_id,
      nombre: row.ubicacion_nombre,
      tipo: row.ubicacion_tipo,
      direccion: row.ubicacion_direccion,
      latitud: row.ubicacion_latitud,
      longitud: row.ubicacion_longitud,
    },
    disponible: row.disponible === null ? null : row.disponible === 1,
  };
}

function buildWhere(filters: VehicleFilters): { sql: string; parameters: SqlParameter[] } {
  const clauses = [PUBLIC_ELIGIBILITY];
  const parameters: SqlParameter[] = [];
  const optionalFilters: Array<[number | string | undefined, string]> = [
    [filters.categoriaId, 'v.categoria_id = ?'],
    [filters.marcaId, 'ma.id = ?'],
    [filters.modeloId, 'v.modelo_id = ?'],
    [filters.precioMin, 'v.precio_dia >= ?'],
    [filters.precioMax, 'v.precio_dia <= ?'],
    [filters.kilometrajeMin, 'v.kilometraje >= ?'],
    [filters.kilometrajeMax, 'v.kilometraje <= ?'],
  ];
  for (const [value, clause] of optionalFilters) {
    if (value !== undefined) {
      clauses.push(clause);
      parameters.push(value);
    }
  }
  if (filters.periodo !== undefined) {
    clauses.push(RENTAL_READY, AVAILABLE_FOR_PERIOD);
    parameters.push(filters.periodo.inicioSql, filters.periodo.finSql);
  }
  return { sql: clauses.join(' AND '), parameters };
}

export class MySqlVehicleRepository implements VehicleRepository {
  constructor(private readonly database: DatabaseConnectionProvider) {}

  async list(filters: VehicleFilters): Promise<VehicleList> {
    return this.run(() => this.database.withConnection(async (connection) => {
      const where = buildWhere(filters);
      const [countRows] = await connection.execute<CountRow[]>(
        `SELECT COUNT(*) AS total ${VEHICLE_JOINS} WHERE ${where.sql}`,
        where.parameters,
      );
      // Con fechas, el WHERE ya conserva únicamente los disponibles.
      const availableColumn = filters.periodo === undefined ? 'NULL' : '1';
      const [rows] = await connection.execute<VehicleRow[]>(
        `SELECT ${VEHICLE_COLUMNS}, ${availableColumn} AS disponible
         ${VEHICLE_JOINS} WHERE ${where.sql}
         ORDER BY v.id ASC LIMIT ? OFFSET ?`,
        [...where.parameters, filters.limit, (filters.page - 1) * filters.limit],
      );
      return { vehicles: rows.map(toVehicle), total: countRows[0]?.total ?? 0 };
    }));
  }

  async findById(id: number, periodo?: CatalogPeriod): Promise<Vehicle | null> {
    return this.run(() => this.database.withConnection(async (connection) => {
      const availability = periodo === undefined ? 'NULL' : `(${RENTAL_READY}) AND (${AVAILABLE_FOR_PERIOD})`;
      const parameters: SqlParameter[] = periodo === undefined
        ? [id]
        : [periodo.inicioSql, periodo.finSql, id];
      // El detalle mantiene visible un vehículo operativo ocupado y lo indica
      // con disponible:false para el período solicitado.
      const [rows] = await connection.execute<VehicleRow[]>(
        `SELECT ${VEHICLE_COLUMNS}, ${availability} AS disponible
         ${VEHICLE_JOINS} WHERE ${PUBLIC_ELIGIBILITY} AND v.id = ? LIMIT 1`,
        parameters,
      );
      const row = rows[0];
      return row === undefined ? null : toVehicle(row);
    }));
  }

  async getCatalogs(): Promise<CatalogsData> {
    return this.run(() => this.database.withConnection(async (connection) => {
      const [categories] = await connection.execute<CatalogRow[]>(
        'SELECT id, nombre FROM categorias WHERE activo = TRUE ORDER BY nombre ASC, id ASC',
      );
      const [brands] = await connection.execute<CatalogRow[]>(
        'SELECT id, nombre FROM marcas WHERE activo = TRUE ORDER BY nombre ASC, id ASC',
      );
      const [models] = await connection.execute<ModelRow[]>(
        `SELECT mo.id, mo.marca_id, mo.nombre
         FROM modelos mo INNER JOIN marcas ma ON ma.id = mo.marca_id
         WHERE ma.activo = TRUE ORDER BY mo.nombre ASC, mo.id ASC`,
      );
      return {
        categorias: categories.map(({ id, nombre }) => ({ id, nombre })),
        marcas: brands.map(({ id, nombre }) => ({ id, nombre })),
        modelos: models.map(({ id, marca_id, nombre }) => ({ id, marca_id, nombre })),
      };
    }));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      throw new ApiError(
        503,
        'DATABASE_UNAVAILABLE',
        'La base de datos no está disponible. Intenta nuevamente más tarde.',
        { cause },
      );
    }
  }
}
