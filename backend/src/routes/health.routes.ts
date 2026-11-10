import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';
import type { HealthService } from '../services/health.service.js';

export function createHealthRouter(service: HealthService): Router {
  const router = Router();
  const controller = new HealthController(service);
  router.get('/', controller.getStatus);
  router.get('/database', controller.getDatabaseStatus);
  return router;
}
