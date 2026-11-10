import type { RequestHandler } from 'express';
import type { VehicleService } from '../services/vehicle.service.js';
import { parseVehicleDetailQuery, parseVehicleFilters, parseVehicleId, validateCatalogsQuery } from '../validators/vehicle.validator.js';

export class VehicleController {
  constructor(private readonly service: VehicleService) {}

  readonly list: RequestHandler = async (request, response) => {
    const data = await this.service.list(parseVehicleFilters(request.query));
    response.json({ success: true, data });
  };

  readonly detail: RequestHandler = async (request, response) => {
    const data = await this.service.detail(parseVehicleId(request.params.id), parseVehicleDetailQuery(request.query));
    response.json({ success: true, data });
  };

  readonly catalogs: RequestHandler = async (request, response) => {
    validateCatalogsQuery(request.query);
    const data = await this.service.getCatalogs();
    response.json({ success: true, data });
  };
}
