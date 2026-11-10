import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

class AuthSetupError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthSetupError';
    this.code = code;
  }
}

function secretAssignments(original) {
  const offset = original.startsWith('\uFEFF') ? 1 : 0;
  // Recorrer todas las asignaciones evita confundir texto dentro de una contraseña
  // entre comillas y de varias líneas con una variable JWT_SECRET independiente.
  const assignments = /^[\t ]*(?:export[\t ]+)?([\w.-]+)[\t ]*(?:=[\t ]*|:[\t ]+)(?:'(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`|[^#\r\n]*)(?:[\t ]*#[^\r\n]*)?/gm;
  return Array.from(original.slice(offset).matchAll(assignments))
    .filter((match) => match[1] === 'JWT_SECRET')
    .map((match) => ({ start: match.index + offset, end: match.index + offset + match[0].length }));
}

// Solo recibe la ruta del archivo; nunca devuelve ni imprime credenciales.
export async function setupAuthSecret(path) {
  try {
    const original = await readFile(path, 'utf8');
    const assignments = secretAssignments(original);
    if (assignments.length > 1) {
      throw new AuthSetupError('DUPLICATE_JWT_SECRET');
    }
    const current = dotenv.parse(original).JWT_SECRET;
    if (current && /^[A-Za-z0-9_-]{43}$/.test(current)) {
      return 'existing';
    }
    if (current) {
      throw new AuthSetupError('INVALID_JWT_SECRET');
    }

    const secret = randomBytes(32).toString('base64url');
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const assignment = `JWT_SECRET="${secret}"`;
    const previous = assignments[0];
    const updated = previous === undefined
      ? `${original}${original.endsWith('\n') ? '' : newline}${newline}# Clave privada de firma de los tokens.${newline}${assignment}${newline}`
      : `${original.slice(0, previous.start)}${assignment}${original.slice(previous.end)}`;
    await writeFile(path, updated, { encoding: 'utf8', mode: 0o600 });
    return 'created';
  } catch (error) {
    if (error instanceof AuthSetupError) {
      throw error;
    }
    // Los errores del sistema de archivos pueden incluir rutas: no se propagan.
    throw new AuthSetupError('AUTH_SETUP_ERROR');
  }
}

async function main() {
  const result = await setupAuthSecret(new URL('../.env', import.meta.url));
  console.info(result === 'existing'
    ? '[autorent-api] JWT_SECRET ya está configurado. Se conserva su valor.'
    : '[autorent-api] JWT_SECRET generado y guardado en backend/.env.');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    const code = error instanceof AuthSetupError ? error.code : 'AUTH_SETUP_ERROR';
    console.error(`[autorent-api] ${code}. Revisa backend/.env y la configuración de JWT_SECRET.`);
    process.exitCode = 1;
  });
}
