import type { MySqlBookingRepository } from '../repositories/booking.repository.js';

// La interfaz permite probar controladores con implementaciones aisladas.
export type BookingOperations = Pick<MySqlBookingRepository,
  'availability' | 'uploadDocument' | 'documentImage' | 'quote' | 'create' | 'list' | 'detail' | 'cancel' | 'checkout' | 'returnVehicle' |
  'locations' | 'saveLocation' | 'notifications' | 'readNotification'>;

export class BookingService {
  constructor(readonly operations: BookingOperations) {}
}
