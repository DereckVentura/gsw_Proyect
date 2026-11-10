import type { FleetInput, FleetPatch } from '../models/fleet.model.js';
import type { FleetRepository } from '../repositories/fleet.repository.js';

export class FleetService {
  constructor(private readonly repository: FleetRepository) {}

  async list(page: number, limit: number) {
    const { vehicles, total } = await this.repository.list(page, limit);
    return { vehicles, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async create(input: FleetInput) { return { vehicle: await this.repository.create(input) }; }
  async update(id: number, patch: FleetPatch) { return { vehicle: await this.repository.update(id, patch) }; }
  async retire(id: number) { return this.update(id, { publicado: false }); }
}
