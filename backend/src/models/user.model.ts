export type UserRole = 'cliente' | 'administrador';

// Este es el único formato de usuario que puede salir de la API.
export interface User {
  id: number;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  rol: UserRole;
}

export interface StoredUser extends User {
  passwordHash: string;
  activo: boolean;
}

export interface CreateClientInput {
  acceptance?: import('../services/legal.service.js').LegalAcceptance;
  nombres: string;
  apellidos: string;
  email: string;
  passwordHash: string;
  telefono: string | null;
}
