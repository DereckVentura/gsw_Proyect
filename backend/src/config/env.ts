import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  auth: { secret: string; expiresInSeconds: number };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function requiredText(value: string | undefined, fallback: string, variable: string): string {
  const result = (value ?? fallback).trim();
  if (result.length === 0) {
    throw new ConfigurationError(`La variable ${variable} no puede estar vacía.`);
  }
  return result;
}

function portNumber(value: string | undefined, fallback: number, variable: string): number {
  if (value === undefined) {
    return fallback;
  }
  // Evita aceptar valores parciales como "3306abc" o números decimales.
  if (!/^\d+$/.test(value)) {
    throw new ConfigurationError(`La variable ${variable} debe ser un puerto entero entre 1 y 65535.`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 65535) {
    throw new ConfigurationError(`La variable ${variable} debe ser un puerto entero entre 1 y 65535.`);
  }
  return result;
}

// Esta función no lee archivos ni cambia process.env: puede verificarse por separado.
export function parseEnvironment(source: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new ConfigurationError('La variable NODE_ENV debe ser development, test o production.');
  }

  const databaseName = requiredText(source.DB_NAME, 'autorent', 'DB_NAME');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(databaseName)) {
    throw new ConfigurationError('La variable DB_NAME debe ser un identificador de base de datos válido.');
  }
  const password = source.DB_PASSWORD;
  if (password === undefined || password.trim().length === 0) {
    throw new ConfigurationError('La variable DB_PASSWORD es obligatoria y no puede estar vacía.');
  }

  const secret = source.JWT_SECRET;
  if (secret === undefined || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new ConfigurationError('La variable JWT_SECRET debe generarse con npm.cmd run auth:setup.');
  }

  return {
    nodeEnv,
    host: requiredText(source.HOST, '127.0.0.1', 'HOST'),
    port: portNumber(source.PORT, 3000, 'PORT'),
    auth: { secret, expiresInSeconds: 3_600 },
    database: {
      host: requiredText(source.DB_HOST, '127.0.0.1', 'DB_HOST'),
      port: portNumber(source.DB_PORT, 3306, 'DB_PORT'),
      name: databaseName,
      user: requiredText(source.DB_USER, 'autorent_app', 'DB_USER'),
      // Las contraseñas pueden contener espacios: se conserva su valor exacto.
      password,
    },
  };
}

export function loadEnvironment(): AppConfig {
  // La misma ruta funciona desde src/config y desde dist/config.
  dotenv.config({
    path: fileURLToPath(new URL('../../.env', import.meta.url)),
    quiet: true,
  });
  return parseEnvironment(process.env);
}
