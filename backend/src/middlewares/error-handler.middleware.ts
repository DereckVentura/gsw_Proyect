import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';

interface BodyParserError {
  type?: unknown;
  status?: unknown;
}

function bodyParserError(error: unknown): BodyParserError | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return {
    type: 'type' in error ? error.type : undefined,
    status: 'status' in error ? error.status : undefined,
  };
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Ocurrió un error inesperado. Intenta nuevamente más tarde.';
  const parsedError = bodyParserError(error);

  if (parsedError?.type === 'entity.parse.failed' && parsedError.status === 400) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'El cuerpo de la solicitud debe contener JSON válido.';
  } else if (parsedError?.type === 'entity.too.large' && parsedError.status === 413) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'El cuerpo de la solicitud supera el tamaño permitido.';
  } else if (
    error instanceof ApiError &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599 &&
    /^[A-Z0-9_]{1,64}$/.test(error.code)
  ) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  }

  if (statusCode >= 500) {
    // No imprimir errores del driver: pueden contener SQL, usuarios o contraseñas.
    console.error(`[autorent-api] ${code}`);
  }
  response.status(statusCode).json({ success: false, error: { code, message } });
};
