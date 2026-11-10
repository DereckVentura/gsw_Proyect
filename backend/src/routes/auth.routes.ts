import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AuthController } from '../controllers/auth.controller.js';
import { createRequireAuth } from '../middlewares/auth.middleware.js';
import type { AuthService } from '../services/auth.service.js';

export function createAuthRouter(service: AuthService, sharedLimiter?: RequestHandler): Router {
  const router = Router();
  const controller = new AuthController(service);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        },
      });
    },
  });
  const noStore: RequestHandler = (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  };
  router.use(noStore);
  router.post('/register', sharedLimiter ?? limiter, controller.register);
  router.post('/login', sharedLimiter ?? limiter, controller.login);
  router.get('/me', createRequireAuth(service), controller.me);
  return router;
}
