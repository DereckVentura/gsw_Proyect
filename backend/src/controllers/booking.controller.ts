import type { Request, RequestHandler, Response } from 'express';
import type { User } from '../models/user.model.js';
import type { BookingService } from '../services/booking.service.js';
import { badInput, parseCancellation, parseCheckout, parseIdempotency, parseLocation, parseReservation, parseReturn } from '../validators/booking.validator.js';
import { parseVehicleFilters, parseVehicleId } from '../validators/vehicle.validator.js';

function user(response: Response): User { return response.locals.user as User; }
function pagination(request: Request, allowState = false) {
  const allowed = ['page', 'limit', ...(allowState ? ['estado'] : [])];
  if (Object.keys(request.query).some((key) => !allowed.includes(key))) return badInput('Revisa los parámetros de consulta.');
  const state = request.query.estado;
  if (state !== undefined && (typeof state !== 'string' || !['confirmada', 'en_curso', 'completada', 'cancelada', 'no_presentado'].includes(state))) return badInput('Selecciona un estado de reserva válido.');
  return { ...parseVehicleFilters({ ...(request.query.page !== undefined ? { page: request.query.page } : {}), ...(request.query.limit !== undefined ? { limit: request.query.limit } : {}) }), state: state as string | undefined };
}

export class BookingController {
  constructor(private readonly service: BookingService) {}
  readonly availability: RequestHandler = async(request,response)=>response.json({success:true,data:await this.service.operations.availability(parseVehicleId(request.params.id))});
  readonly uploadDocument: RequestHandler = async(request,response)=>response.status(201).json({success:true,data:await this.service.operations.uploadDocument(user(response),request.body)});
  readonly documentImage: RequestHandler = async(request,response)=>{const data=await this.service.operations.documentImage(user(response),String(request.params.id),request.query.side==='back');response.setHeader('Cache-Control','private, no-store');response.setHeader('Content-Type',data.type);response.send(data.bytes);};
  readonly quote: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.quote(parseReservation(request.body)) });
  readonly create: RequestHandler = async (request, response) => {
    const input = parseReservation(request.body);
    if (input.precio_confirmado === undefined) badInput('Consulta y confirma la tarifa antes de reservar.');
    const data = await this.service.operations.create(user(response), input, parseIdempotency(request.headers['idempotency-key']));
    response.status(data.replayed ? 200 : 201).json({ success: true, data });
  };
  readonly list: RequestHandler = async (request, response) => {
    const { page, limit, state } = pagination(request, true);
    response.json({ success: true, data: await this.service.operations.list(user(response), page, limit, state) });
  };
  readonly detail: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.detail(user(response), parseVehicleId(request.params.id)) });
  readonly cancel: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.cancel(user(response), parseVehicleId(request.params.id), parseCancellation(request.body)) });
  readonly checkout: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.checkout(user(response), parseVehicleId(request.params.id), parseCheckout(request.body)) });
  readonly returnVehicle: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.returnVehicle(user(response), parseVehicleId(request.params.id), parseReturn(request.body)) });
  readonly locations: RequestHandler = async (_request, response) => response.json({ success: true, data: await this.service.operations.locations() });
  readonly adminLocations: RequestHandler = async (_request, response) => response.json({ success: true, data: await this.service.operations.locations(true) });
  readonly createLocation: RequestHandler = async (request, response) => response.status(201).json({ success: true, data: await this.service.operations.saveLocation(parseLocation(request.body)) });
  readonly updateLocation: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.saveLocation(parseLocation(request.body), parseVehicleId(request.params.id)) });
  readonly notifications: RequestHandler = async (request, response) => {
    const { page, limit } = pagination(request);
    response.json({ success: true, data: await this.service.operations.notifications(user(response).id, page, limit) });
  };
  readonly readNotification: RequestHandler = async (request, response) => response.json({ success: true, data: await this.service.operations.readNotification(user(response).id, parseVehicleId(request.params.id)) });
}
