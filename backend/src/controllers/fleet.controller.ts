import type { RequestHandler } from 'express';
import type { FleetService } from '../services/fleet.service.js';
import { parseFleetCreate, parseFleetPatch } from '../validators/fleet.validator.js';
import { parseVehicleFilters, parseVehicleId } from '../validators/vehicle.validator.js';
import { ApiError } from '../utils/api-error.js';

export class FleetController {
  constructor(private readonly service: FleetService) {}
  readonly list: RequestHandler = async (request, response) => {
    if (Object.keys(request.query).some((key) => !['page', 'limit'].includes(key))) throw new ApiError(400, 'VALIDATION_ERROR', 'Usa únicamente page y limit.');
    const { page, limit } = parseVehicleFilters(request.query);
    response.json({ success: true, data: await this.service.list(page, limit) });
  };
  readonly create: RequestHandler = async (request, response) => {
    response.status(201).json({ success: true, data: await this.service.create(parseFleetCreate(request.body)) });
  };
  readonly update: RequestHandler = async (request, response) => {
    response.json({ success: true, data: await this.service.update(parseVehicleId(request.params.id), parseFleetPatch(request.body)) });
  };
  readonly retire: RequestHandler = async (request, response) => {
    response.json({ success: true, data: await this.service.retire(parseVehicleId(request.params.id)) });
  };
}
