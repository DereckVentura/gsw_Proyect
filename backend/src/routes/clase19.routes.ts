// Adaptación de src/index.ts de manasesortez/blog.local.api, Clase 19.
// Base: 7d1bfb049049197581dcf11c308c9a27fb87553a. Ver README, procedencia.
import { Router } from 'express';
import { VehicleController } from '../controllers/vehicle.controller.js';
import type { VehicleService } from '../services/vehicle.service.js';

export function createClase19Router(service: VehicleService): Router {
  const router = Router();
  // /info conserva el patrón Express/TS de blog.local con identidad del negocio.
  router.get('/info', (_req, res) => {
    res.json({ servicio: 'AutoRent - Rent a Car Molina', version: '2.0.0',
      so: process.platform, node: process.version, fecha: new Date().toISOString() });
  });
  // /articulos y /articulos/:id se adaptan al catálogo real en MySQL.
  const vehicles = new VehicleController(service);
  router.get('/vehiculos', vehicles.list);
  router.get('/vehiculos/:id', vehicles.detail);
  return router;
}
