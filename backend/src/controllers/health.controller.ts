import type { RequestHandler } from 'express';
import type { HealthService } from '../services/health.service.js';

export class HealthController {
  constructor(private readonly service: HealthService) {}

  getStatus: RequestHandler = (_request, response) => {
    response.status(200).json({ success: true, data: this.service.getStatus() });
  };

  getDatabaseStatus: RequestHandler = async (_request, response) => {
    const data = await this.service.getDatabaseStatus();
    response.status(200).json({ success: true, data });
  };
}
