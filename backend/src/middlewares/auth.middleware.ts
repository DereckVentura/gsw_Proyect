import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { ApiError } from '../utils/api-error.js';

export function createRequireAuth(service: AuthService): RequestHandler {
  return async (request, response, next) => {
    const header = request.headers.authorization;
    if (header === undefined) {
      throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión para continuar.');
    }
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
    if (match?.[1] === undefined || header.length > 2_048) {
      throw new ApiError(401, 'INVALID_TOKEN', 'La sesión no es válida o ha expirado.');
    }
    // El rol y el estado proceden de MySQL, no de datos enviados por el cliente.
    response.locals.user = await service.authenticate(match[1]);
    next();
  };
}
