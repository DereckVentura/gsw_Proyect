export interface TechnicalReference {
  titulo: string;
  url: string;
  mercado: string;
  resumen: string;
}

export interface VehicleFacts {
  color: string | null;
  version: string | null;
  traccion: 'FWD' | 'AWD' | '4WD' | null;
  plazas: number | null;
  motor_litros: string | null;
  potencia_hp: number | null;
  transmision: 'CVT' | 'automatica' | 'manual' | null;
  combustible: 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | null;
  anio_verificado: boolean;
  observaciones: string | null;
  fotos: Array<{ url: string; alt: string }>;
  referencias: TechnicalReference[];
}

export function emptyFacts(): VehicleFacts {
  return {
    color: null, version: null, traccion: null, plazas: null,
    motor_litros: null, potencia_hp: null, transmision: null,
    combustible: null, anio_verificado: false, observaciones: null,
    fotos: [], referencias: [],
  };
}

export interface FleetInput {
  marca: string;
  modelo: string;
  categoria_id: number;
  anio: number;
  placa: string | null;
  kilometraje: number | null;
  precio_dia: string | null;
  ubicacion_actual_id: number | null;
  estado_operativo: 'operativo' | 'mantenimiento' | 'inactivo';
  publicado: boolean;
  descripcion: string | null;
  ficha: VehicleFacts;
}

export type FleetPatch = Partial<FleetInput>;

export interface AdminVehicle extends FleetInput {
  id: number;
  codigo_interno: string | null;
  marca_id: number;
  modelo_id: number;
}
