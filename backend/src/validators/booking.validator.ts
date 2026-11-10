import type { CheckoutInput, LocationInput, ReservationInput, ReturnInput } from '../models/booking.model.js';
import { parseVehicleDetailQuery } from './vehicle.validator.js';
import { ApiError } from '../utils/api-error.js';

export function badInput(message: string): never { throw new ApiError(400, 'VALIDATION_ERROR', message); }
export function bodyObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return badInput('Envía un objeto JSON.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key))) return badInput('La petición contiene campos no permitidos.');
  return body;
}
export function wholeNumber(value: unknown, min = 1, max = 4294967295): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return badInput('Revisa los identificadores y kilometrajes.');
  return value;
}
export function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) return badInput('Revisa el texto ingresado.');
  return value.trim();
}
function notes(value: unknown): string | null { return value === undefined || value === null ? null : boundedText(value, 500); }

export function parseReservation(value: unknown): ReservationInput {
  const body = bodyObject(value, ['vehiculo_id', 'entrega_id', 'devolucion_id', 'inicio', 'fin', 'precio_confirmado', 'aceptacion', 'documento_id']);
  const period = parseVehicleDetailQuery({ inicio: body.inicio, fin: body.fin });
  if (period === undefined) return badInput('Selecciona inicio y fin.');
  if (Date.parse(period.finUtc) - Date.parse(period.inicioUtc) > 365 * 86400000) return badInput('La reserva puede durar como máximo 365 días.');
  if (body.precio_confirmado !== undefined && (typeof body.precio_confirmado !== 'string' || !/^(?:0|[1-9]\d{0,7})\.\d{2}$/.test(body.precio_confirmado))) return badInput('Revisa la tarifa confirmada.');
  if(body.documento_id!==undefined&&(typeof body.documento_id!=='string'||! /^[a-f0-9-]{36}$/.test(body.documento_id)))return badInput('Adjunta una licencia válida.');
  return { ...(body.documento_id?{documento_id:body.documento_id as string}:{}), vehiculo_id: wholeNumber(body.vehiculo_id), entrega_id: wholeNumber(body.entrega_id), devolucion_id: wholeNumber(body.devolucion_id), inicio_utc: period.inicioUtc, fin_utc: period.finUtc, ...(body.precio_confirmado !== undefined ? {precio_confirmado: body.precio_confirmado as string} : {}), ...(body.aceptacion !== undefined ? {aceptacion:body.aceptacion} : {}) };
}
export function parseIdempotency(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(value)) return badInput('Envía Idempotency-Key con un identificador de operación de 16 a 80 caracteres.');
  return value;
}
export function parseCheckout(value: unknown): CheckoutInput {
  const body = bodyObject(value, ['kilometraje', 'observaciones', 'licencia_valida']);
  return { licencia_valida:body.licencia_valida===true, kilometraje: wholeNumber(body.kilometraje, 0), observaciones: notes(body.observaciones) };
}
export function parseReturn(value: unknown): ReturnInput {
  const body = bodyObject(value, ['kilometraje', 'ubicacion_id', 'observaciones']);
  return { kilometraje: wholeNumber(body.kilometraje, 0), ubicacion_id: wholeNumber(body.ubicacion_id), observaciones: notes(body.observaciones) };
}
export function parseCancellation(value: unknown): string | null {
  return notes(bodyObject(value ?? {}, ['motivo']).motivo);
}
export function parseLocation(value: unknown): LocationInput {
  const body = bodyObject(value, ['nombre', 'tipo', 'direccion', 'latitud', 'longitud', 'activo']);
  if (!['sucursal', 'punto_autorizado'].includes(String(body.tipo))) return badInput('Selecciona el tipo de ubicación.');
  const coordinate = (value: unknown, max: number) => {
    if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,7})?$/.test(value) || Math.abs(Number(value)) > max) return badInput('Revisa las coordenadas geográficas.');
    return value;
  };
  if (body.activo !== undefined && typeof body.activo !== 'boolean') return badInput('El estado debe ser verdadero o falso.');
  return { nombre: boundedText(body.nombre, 120), tipo: body.tipo as LocationInput['tipo'], direccion: boundedText(body.direccion, 255), latitud: coordinate(body.latitud, 90), longitud: coordinate(body.longitud, 180), activo: body.activo !== false };
}
