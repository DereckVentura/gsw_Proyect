import type { RequestHandler } from 'express';
import { ApiError } from '../utils/api-error.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'La ruta solicitada no existe.'));
};
