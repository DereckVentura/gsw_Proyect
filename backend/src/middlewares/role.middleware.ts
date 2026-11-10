import type { RequestHandler } from 'express';
import type { User, UserRole } from '../models/user.model.js';
import { ApiError } from '../utils/api-error.js';

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (_request, response, next) => {
    const user = response.locals.user as User | undefined;
    if (user === undefined) {
      throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión para continuar.');
    }
    if (!roles.includes(user.rol)) {
      throw new ApiError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta operación.');
    }
    next();
  };
}
