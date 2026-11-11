import { createClase19Router } from './routes/clase19.routes.js';
import { hostname } from 'node:os';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { notFoundHandler } from './middlewares/not-found.middleware.js';
import { createHealthRouter } from './routes/health.routes.js';
import type { HealthService } from './services/health.service.js';
import { createAuthRouter } from './routes/auth.routes.js';
import type { AuthService } from './services/auth.service.js';
import { createVehicleRouter } from './routes/vehicle.routes.js';
import type { VehicleService } from './services/vehicle.service.js';
import { fileURLToPath } from 'node:url';
import { createFleetRouter } from './routes/fleet.routes.js';
import type { FleetService } from './services/fleet.service.js';
import type { BookingService } from './services/booking.service.js';
import { createBookingRouter } from './routes/booking.routes.js';
import type { DeploymentConfig } from './config/deployment.js';
import { createMediaRouter } from './routes/media.routes.js';
import { ApiError } from './utils/api-error.js';
import type { LegalService } from './services/legal.service.js';
import { createLegalRouter } from './routes/legal.routes.js';

export interface AppOptions { deployment?: DeploymentConfig; authLimiter?: RequestHandler; legal?: LegalService }

export function createApp(service: HealthService, authService?: AuthService, vehicleService?: VehicleService, fleetService?: FleetService, bookingService?: BookingService, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => { response.setHeader('X-AutoRent-Node', process.env.NODE_ID || hostname()); next(); });
  app.get('/health', async (request, response) => {
    const nodo=process.env.NODE_ID || hostname();
    if(process.env.ENABLE_FAILURE_SIMULATION==='true' && request.query.simular==='falla') {
      response.status(503).json({estado:'no saludable',nodo,timestamp:new Date().toISOString()});return;
    }
    await service.getDatabaseStatus();
    response.json({estado:'saludable',nodo,timestamp:new Date().toISOString(),database:'connected'});
  });
  app.use(helmet());
  app.use((request, response, next) => {
    response.on('finish', () => console.info(JSON.stringify({ method: request.method, path: request.originalUrl, status: response.statusCode })));
    next();
  });
  if (vehicleService) app.use('/api', createClase19Router(vehicleService));
  app.set('trust proxy', options.deployment?.proxyHops ?? 0);
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin && options.deployment?.origins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      if (request.method === 'OPTIONS') { response.sendStatus(204); return; }
    } else if (origin && request.method === 'OPTIONS') {
      next(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'El origen de la aplicación no está habilitado.')); return;
    }
    next();
  });
  app.use('/api/v1', (_request, response, next) => {
    // También protege las respuestas de error producidas al leer el cuerpo JSON.
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/v1/admin/content', express.json({ limit: '96kb' }));
  app.use('/api/v1/driver-documents', express.json({limit:'9mb'}));
  app.use(express.json({ limit: '16kb' }));
  const photos = fileURLToPath(new URL('../public/vehicles/', import.meta.url));
  app.use('/media/vehicles', (_request, response, next) => { response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); }, express.static(photos, { dotfiles: 'deny', index: false, fallthrough: true }));
  app.use('/api/v1/health', createHealthRouter(service));
  if (authService !== undefined) {
    app.use('/api/v1/auth', createAuthRouter(authService, options.authLimiter));
    if (options.legal) app.use('/api/v1', createLegalRouter(options.legal, authService));
    app.use('/api/v1/admin/media', createMediaRouter(authService, options.deployment?.cloudinary));
  }
  if (vehicleService !== undefined) {
    app.use('/api/v1', createVehicleRouter(vehicleService));
  }
  if (fleetService !== undefined && authService !== undefined) {
    app.use('/api/v1/admin/vehicles', createFleetRouter(fleetService, authService));
  }
  if (bookingService !== undefined && authService !== undefined) app.use('/api/v1', createBookingRouter(bookingService, authService));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
