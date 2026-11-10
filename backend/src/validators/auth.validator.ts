import { ApiError } from '../utils/api-error.js';

export interface RegisterInput {
  aceptacion?: unknown;
  nombres: string;
  apellidos: string;
  email: string;
  password: string;
  telefono: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

function validationError(message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}

function objectInput(value: unknown, allowedFields: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) {
    return validationError('Envía un objeto JSON con los campos requeridos.');
  }
  if (Object.keys(value).some((field) => !allowedFields.includes(field))) {
    return validationError('La solicitud contiene campos no permitidos.');
  }
  return value as Record<string, unknown>;
}

function personName(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    return validationError(`El campo ${field} es obligatorio y debe ser texto.`);
  }
  const cleaned = value.trim();
  if (cleaned.length === 0 || Array.from(cleaned).length > 100 || /[\p{Cc}\p{Cs}]/u.test(cleaned)) {
    return validationError(`El campo ${field} debe tener entre 1 y 100 caracteres, sin caracteres de control.`);
  }
  return cleaned;
}

export function parseEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return validationError('El correo electrónico es obligatorio y debe ser texto.');
  }
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (email.length > 254 || parts.length !== 2 || local === undefined || domain === undefined
    || local.length === 0 || local.length > 64 || local.startsWith('.') || local.endsWith('.')
    || local.includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    || domain.length > 253 || !domain.includes('.')
    || domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return validationError('Introduce un correo electrónico válido de hasta 254 caracteres.');
  }
  return email;
}

function passwordValue(value: unknown, registering: boolean): string {
  if (typeof value !== 'string' || value.length === 0) {
    return validationError('La contraseña es obligatoria y debe ser texto.');
  }
  // Los sustitutos aislados se convierten a bytes de reemplazo en UTF-8.
  if (/\p{Cs}/u.test(value)) {
    return validationError('La contraseña debe contener caracteres Unicode válidos.');
  }
  // bcrypt procesa como máximo 72 bytes; rechazar el exceso evita truncar contraseñas.
  if (Buffer.byteLength(value, 'utf8') > 72) {
    return validationError('La contraseña no puede superar 72 bytes en UTF-8; algunos caracteres ocupan más de un byte.');
  }
  if (registering && Array.from(value).length < 8) {
    return validationError('La contraseña debe tener al menos 8 caracteres.');
  }
  // La contraseña se conserva exactamente, incluidos los espacios iniciales y finales.
  return value;
}

function telephoneNumber(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return validationError('El teléfono debe ser texto o null.');
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) {
    return null;
  }
  if (cleaned.length > 25 || !/^[0-9+() -]+$/.test(cleaned) || !/[0-9]/.test(cleaned)) {
    return validationError('El teléfono debe tener hasta 25 caracteres: números, espacios, +, paréntesis o guiones.');
  }
  return cleaned;
}

export function parseRegisterInput(value: unknown): RegisterInput {
  const input = objectInput(value, ['nombres', 'apellidos', 'email', 'password', 'telefono', 'aceptacion']);
  return {
    nombres: personName(input.nombres, 'nombres'),
    apellidos: personName(input.apellidos, 'apellidos'),
    email: parseEmail(input.email),
    password: passwordValue(input.password, true),
    telefono: telephoneNumber(input.telefono),
    ...(input.aceptacion !== undefined ? { aceptacion: input.aceptacion } : {}),
  };
}

export function parseLoginInput(value: unknown): LoginInput {
  const input = objectInput(value, ['email', 'password']);
  return { email: parseEmail(input.email), password: passwordValue(input.password, false) };
}
