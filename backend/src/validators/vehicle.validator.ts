import type { CatalogPeriod, VehicleFilters } from '../models/vehicle.model.js';
import { ApiError } from '../utils/api-error.js';

const MAX_UNSIGNED_INT = 4_294_967_295;
const PERIOD_FIELDS = ['inicio', 'fin'];
const LIST_FIELDS = [
  'categoria_id', 'marca_id', 'modelo_id', 'precio_min', 'precio_max',
  'kilometraje_min', 'kilometraje_max', 'page', 'limit', ...PERIOD_FIELDS,
];

function invalid(message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}

function queryObject(value: unknown, allowed: readonly string[]): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('Los filtros deben enviarse como parámetros de consulta.');
  }
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, field] of Object.entries(value)) {
    if (!allowed.includes(key)) {
      return invalid('La consulta contiene parámetros no permitidos.');
    }
    if (typeof field !== 'string') {
      return invalid('Cada filtro debe enviarse una sola vez y contener un valor de texto.');
    }
    result[key] = field;
  }
  return result;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,9})$/.test(value)) {
    return invalid(`El parámetro ${field} debe ser un entero válido.`);
  }
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) {
    return invalid(`El parámetro ${field} debe estar entre ${minimum} y ${maximum}.`);
  }
  return parsed;
}

function amount(value: string, field: string): string {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    return invalid(`El parámetro ${field} debe estar entre 0 y 99999999.99, con hasta dos decimales.`);
  }
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function timestamp(value: string, field: string): { iso: string; sql: string; milliseconds: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (match === null) {
    return invalid(`El parámetro ${field} debe ser una fecha ISO con segundos y zona horaria, por ejemplo 2026-11-10T14:00:00Z.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const zone = match[8] as string;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (year < 1000 || year > 9999 || local.getUTCFullYear() !== year ||
      local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day ||
      local.getUTCHours() !== hour || local.getUTCMinutes() !== minute ||
      local.getUTCSeconds() !== second) {
    return invalid(`El parámetro ${field} contiene una fecha u hora inexistente.`);
  }
  let offset = 0;
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      return invalid(`El parámetro ${field} contiene una zona horaria inválida.`);
    }
    offset = (offsetHour * 60 + offsetMinute) * (zone.startsWith('-') ? -1 : 1);
  }
  const instant = new Date(local.getTime() - offset * 60_000);
  if (instant.getUTCFullYear() < 1000 || instant.getUTCFullYear() > 9999) {
    return invalid(`El parámetro ${field} queda fuera del intervalo de fechas admitido en UTC.`);
  }
  const iso = instant.toISOString();
  return { iso, sql: iso.slice(0, -1).replace('T', ' '), milliseconds: instant.getTime() };
}

function period(query: Record<string, string>): CatalogPeriod | undefined {
  if (query.inicio === undefined && query.fin === undefined) {
    return undefined;
  }
  if (query.inicio === undefined || query.fin === undefined) {
    return invalid('Envía inicio y fin juntos para consultar disponibilidad.');
  }
  const start = timestamp(query.inicio, 'inicio');
  const end = timestamp(query.fin, 'fin');
  if (end.milliseconds <= start.milliseconds) {
    return invalid('La fecha de fin debe ser posterior a la fecha de inicio.');
  }
  return { inicioUtc: start.iso, finUtc: end.iso, inicioSql: start.sql, finSql: end.sql };
}

export function parseVehicleFilters(value: unknown): VehicleFilters {
  const query = queryObject(value, LIST_FIELDS);
  const result: VehicleFilters = {
    page: query.page === undefined ? 1 : integer(query.page, 'page', 1, 1_000_000),
    limit: query.limit === undefined ? 20 : integer(query.limit, 'limit', 1, 100),
  };
  if (query.categoria_id !== undefined) result.categoriaId = integer(query.categoria_id, 'categoria_id', 1, MAX_UNSIGNED_INT);
  if (query.marca_id !== undefined) result.marcaId = integer(query.marca_id, 'marca_id', 1, MAX_UNSIGNED_INT);
  if (query.modelo_id !== undefined) result.modeloId = integer(query.modelo_id, 'modelo_id', 1, MAX_UNSIGNED_INT);
  if (query.precio_min !== undefined) result.precioMin = amount(query.precio_min, 'precio_min');
  if (query.precio_max !== undefined) result.precioMax = amount(query.precio_max, 'precio_max');
  if (query.kilometraje_min !== undefined) result.kilometrajeMin = integer(query.kilometraje_min, 'kilometraje_min', 0, MAX_UNSIGNED_INT);
  if (query.kilometraje_max !== undefined) result.kilometrajeMax = integer(query.kilometraje_max, 'kilometraje_max', 0, MAX_UNSIGNED_INT);
  if (result.precioMin !== undefined && result.precioMax !== undefined &&
      Number(result.precioMin.replace('.', '')) > Number(result.precioMax.replace('.', ''))) {
    return invalid('precio_min no puede ser mayor que precio_max.');
  }
  if (result.kilometrajeMin !== undefined && result.kilometrajeMax !== undefined && result.kilometrajeMin > result.kilometrajeMax) {
    return invalid('kilometraje_min no puede ser mayor que kilometraje_max.');
  }
  const requestedPeriod = period(query);
  if (requestedPeriod !== undefined) result.periodo = requestedPeriod;
  return result;
}

export function parseVehicleDetailQuery(value: unknown): CatalogPeriod | undefined {
  return period(queryObject(value, PERIOD_FIELDS));
}

export function parseVehicleId(value: unknown): number {
  return integer(value, 'id', 1, MAX_UNSIGNED_INT);
}

export function validateCatalogsQuery(value: unknown): void {
  queryObject(value, []);
}
