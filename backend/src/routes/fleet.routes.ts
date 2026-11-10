import { Router } from 'express';
import { FleetController } from '../controllers/fleet.controller.js';
import { createRequireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import type { AuthService } from '../services/auth.service.js';
import type { FleetService } from '../services/fleet.service.js';

export function createFleetRouter(service: FleetService, auth: AuthService): Router {
  const router = Router();
  const controller = new FleetController(service);
  router.use(createRequireAuth(auth));
  router.use(requireRole('administrador'));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  // Se oculta la unidad conservando su historial y sus relaciones.
  router.delete('/:id', controller.retire);
  return router;
}
