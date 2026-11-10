import type { FleetInput, FleetPatch, VehicleFacts } from '../models/fleet.model.js';
import { emptyFacts } from '../models/fleet.model.js';
import { ApiError } from '../utils/api-error.js';

function invalid(field: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', `Revisa el campo ${field}.`);
}

function object(value: unknown, fields: readonly string[], field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid(field);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key))) return invalid(field);
  return record;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) return invalid(field);
  return value.trim();
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid(field);
  return value;
}

function choice<const T extends string>(value: unknown, field: string, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) return invalid(field);
  return value as T;
}

function flag(value: unknown, field: string): boolean {
  return typeof value === 'boolean' ? value : invalid(field);
}

function imageUrl(value: unknown): string {
  const url = text(value, 'fotos.url', 2048);
  // Se admiten archivos locales servidos por la API y fotos externas HTTPS.
  if (/^\/media\/vehicles\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(url)) return url;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return invalid('fotos.url'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return invalid('fotos.url');
  return url;
}

export function parseFacts(value: unknown): VehicleFacts {
  const defaults = emptyFacts();
  const body = object(value, Object.keys(defaults), 'ficha');
  const result = { ...defaults };
  for (const field of ['color', 'version', 'observaciones'] as const) {
    if (body[field] !== undefined && body[field] !== null) result[field] = text(body[field], field, field === 'observaciones' ? 1000 : 80);
  }
  if (body.traccion !== undefined && body.traccion !== null) result.traccion = choice(body.traccion, 'traccion', ['FWD', 'AWD', '4WD']);
  if (body.plazas !== undefined && body.plazas !== null) result.plazas = integer(body.plazas, 'plazas', 1, 60);
  if (body.potencia_hp !== undefined && body.potencia_hp !== null) result.potencia_hp = integer(body.potencia_hp, 'potencia_hp', 1, 2000);
  if (body.motor_litros !== undefined && body.motor_litros !== null) {
    const engine = text(body.motor_litros, 'motor_litros', 5);
    if (!/^(?:[1-9]|[1-9][0-9])(?:\.[0-9]{1,2})?$/.test(engine)) return invalid('motor_litros');
    result.motor_litros = engine;
  }
  if (body.transmision !== undefined && body.transmision !== null) result.transmision = choice(body.transmision, 'transmision', ['CVT', 'automatica', 'manual']);
  if (body.combustible !== undefined && body.combustible !== null) result.combustible = choice(body.combustible, 'combustible', ['gasolina', 'diesel', 'hibrido', 'electrico']);
  if (body.anio_verificado !== undefined) result.anio_verificado = flag(body.anio_verificado, 'anio_verificado');
  if (body.fotos !== undefined) {
    if (!Array.isArray(body.fotos) || body.fotos.length > 12) return invalid('fotos');
    result.fotos = body.fotos.map((photo: unknown) => {
      const item = object(photo, ['url', 'alt'], 'foto');
      return { url: imageUrl(item.url), alt: text(item.alt, 'foto.alt', 160) };
    });
  }
  if (body.referencias !== undefined) {
    if (!Array.isArray(body.referencias) || body.referencias.length > 5) return invalid('referencias');
    result.referencias = body.referencias.map((reference: unknown) => {
      const item = object(reference, ['titulo', 'url', 'mercado', 'resumen'], 'referencia');
      const url = text(item.url, 'referencia.url', 2048);
      let parsed: URL;
      try { parsed = new URL(url); } catch { return invalid('referencia.url'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return invalid('referencia.url');
      return { titulo: text(item.titulo, 'titulo', 160), url, mercado: text(item.mercado, 'mercado', 80), resumen: text(item.resumen, 'resumen', 1200) };
    });
  }
  return result;
}

const FIELDS = ['marca', 'modelo', 'categoria_id', 'anio', 'placa', 'kilometraje', 'precio_dia', 'ubicacion_actual_id', 'estado_operativo', 'publicado', 'descripcion', 'ficha'] as const;

export function parseFleetPatch(value: unknown): FleetPatch {
  const body = object(value, FIELDS, 'vehiculo');
  if (Object.keys(body).length === 0) return invalid('vehiculo');
  const result: FleetPatch = {};
  for (const field of ['marca', 'modelo'] as const) if (field in body) result[field] = text(body[field], field, 80);
  if ('categoria_id' in body) result.categoria_id = integer(body.categoria_id, 'categoria_id', 1, 4294967295);
  if ('anio' in body) result.anio = integer(body.anio, 'anio', 1886, new Date().getUTCFullYear() + 1);
  if ('placa' in body) result.placa = body.placa === null ? null : text(body.placa, 'placa', 20).toUpperCase();
  if ('kilometraje' in body) result.kilometraje = body.kilometraje === null ? null : integer(body.kilometraje, 'kilometraje', 0, 4294967295);
  if ('ubicacion_actual_id' in body) result.ubicacion_actual_id = body.ubicacion_actual_id === null ? null : integer(body.ubicacion_actual_id, 'ubicacion_actual_id', 1, 4294967295);
  if ('precio_dia' in body) {
    if (body.precio_dia === null) result.precio_dia = null;
    else {
      const price = text(body.precio_dia, 'precio_dia', 11);
      if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0) return invalid('precio_dia');
      const [whole, cents = ''] = price.split('.');
      result.precio_dia = `${whole}.${cents.padEnd(2, '0')}`;
    }
  }
  if ('estado_operativo' in body) result.estado_operativo = choice(body.estado_operativo, 'estado_operativo', ['operativo', 'mantenimiento', 'inactivo']);
  if ('publicado' in body) result.publicado = flag(body.publicado, 'publicado');
  if ('descripcion' in body) result.descripcion = body.descripcion === null ? null : text(body.descripcion, 'descripcion', 2000);
  if ('ficha' in body) result.ficha = parseFacts(body.ficha);
  return result;
}

export function parseFleetCreate(value: unknown): FleetInput {
  const patch = parseFleetPatch(value);
  if (patch.marca === undefined || patch.modelo === undefined || patch.categoria_id === undefined || patch.anio === undefined) return invalid('marca, modelo, categoria_id y anio');
  return {
    placa: null, kilometraje: null, precio_dia: null, ubicacion_actual_id: null,
    estado_operativo: 'inactivo', publicado: false, descripcion: null, ficha: emptyFacts(),
    ...patch,
    marca: patch.marca, modelo: patch.modelo, categoria_id: patch.categoria_id, anio: patch.anio,
  };
}
