import { Router } from 'express';
import { VehicleController } from '../controllers/vehicle.controller.js';
import type { VehicleService } from '../services/vehicle.service.js';

export function createVehicleRouter(service: VehicleService): Router {
  const router = Router();
  const controller = new VehicleController(service);
  router.get('/vehicles', controller.list);
  router.get('/vehicles/:id', controller.detail);
  router.get('/catalogs', controller.catalogs);
  return router;
}
