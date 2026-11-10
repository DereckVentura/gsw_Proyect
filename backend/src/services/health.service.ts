import type { DatabaseHealthStatus, HealthStatus } from '../models/health.model.js';
import type { HealthRepository } from '../repositories/health.repository.js';
import { ApiError } from '../utils/api-error.js';

export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  getStatus(): HealthStatus {
    return {
      service: 'autorent-api',
      status: 'ok',
      timestamp: this.clock().toISOString(),
    };
  }

  async getDatabaseStatus(): Promise<DatabaseHealthStatus> {
    try {
      await this.repository.checkDatabase();
    } catch (cause) {
      // El detalle original queda disponible internamente, nunca en la respuesta HTTP.
      throw new ApiError(
        503,
        'DATABASE_UNAVAILABLE',
        'No se pudo conectar con la base de datos. Intenta nuevamente más tarde.',
        { cause },
      );
    }
    return { ...this.getStatus(), database: 'connected' };
  }
}
