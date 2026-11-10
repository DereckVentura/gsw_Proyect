import type {
  CatalogPeriod,
  CatalogsData,
  Vehicle,
  VehicleFilters,
  VehiclePeriodResponse,
} from '../models/vehicle.model.js';
import type { VehicleRepository } from '../repositories/vehicle.repository.js';
import { ApiError } from '../utils/api-error.js';

function publicPeriod(periodo: CatalogPeriod | undefined): VehiclePeriodResponse | null {
  return periodo === undefined ? null : { inicio_utc: periodo.inicioUtc, fin_utc: periodo.finUtc };
}

export class VehicleService {
  constructor(private readonly repository: VehicleRepository) {}

  async list(filters: VehicleFilters): Promise<{
    vehicles: Vehicle[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    periodo: VehiclePeriodResponse | null;
  }> {
    const { vehicles, total } = await this.repository.list(filters);
    return {
      vehicles,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
      periodo: publicPeriod(filters.periodo),
    };
  }

  async detail(id: number, periodo?: CatalogPeriod): Promise<{
    vehicle: Vehicle;
    periodo: VehiclePeriodResponse | null;
  }> {
    const vehicle = await this.repository.findById(id, periodo);
    if (vehicle === null) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'El vehículo no se encuentra disponible en el catálogo.');
    }
    return { vehicle, periodo: publicPeriod(periodo) };
  }

  getCatalogs(): Promise<CatalogsData> {
    return this.repository.getCatalogs();
  }
}
