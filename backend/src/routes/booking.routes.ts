import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { createRequireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import type { AuthService } from '../services/auth.service.js';
import type { BookingService } from '../services/booking.service.js';

export function createBookingRouter(service: BookingService, auth: AuthService): Router {
  const router = Router(); const controller = new BookingController(service);
  const authenticate = createRequireAuth(auth); const admin = requireRole('administrador');
  router.get('/vehicles/:id/availability', controller.availability);
  router.post('/driver-documents', authenticate, requireRole('cliente'), controller.uploadDocument);
  router.get('/driver-documents/:id/image', authenticate, controller.documentImage);
  router.get('/locations', controller.locations);
  router.post('/reservations/quote', authenticate, controller.quote);
  router.post('/reservations', authenticate, requireRole('cliente'), controller.create);
  router.get('/reservations', authenticate, controller.list);
  router.get('/reservations/:id', authenticate, controller.detail);
  router.post('/reservations/:id/cancel', authenticate, controller.cancel);
  router.post('/admin/reservations/:id/checkout', authenticate, admin, controller.checkout);
  router.post('/admin/reservations/:id/return', authenticate, admin, controller.returnVehicle);
  router.get('/admin/locations', authenticate, admin, controller.adminLocations);
  router.post('/admin/locations', authenticate, admin, controller.createLocation);
  router.put('/admin/locations/:id', authenticate, admin, controller.updateLocation);
  router.get('/notifications', authenticate, controller.notifications);
  router.post('/notifications/:id/read', authenticate, controller.readNotification);
  return router;
}
