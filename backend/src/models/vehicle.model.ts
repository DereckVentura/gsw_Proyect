import type { VehicleFacts } from './fleet.model.js';

export interface CatalogPeriod {
  inicioUtc: string;
  finUtc: string;
  inicioSql: string;
  finSql: string;
}

export interface VehicleFilters {
  categoriaId?: number;
  marcaId?: number;
  modeloId?: number;
  precioMin?: string;
  precioMax?: string;
  kilometrajeMin?: number;
  kilometrajeMax?: number;
  page: number;
  limit: number;
  periodo?: CatalogPeriod;
}

export interface CatalogOption {
  id: number;
  nombre: string;
}

export interface CatalogsData {
  categorias: CatalogOption[];
  marcas: CatalogOption[];
  modelos: Array<CatalogOption & { marca_id: number }>;
}

export interface Vehicle {
  id: number;
  placa: string | null;
  anio: number;
  kilometraje: number | null;
  // Los DECIMAL de MySQL se conservan como texto para no perder precisión.
  precio_dia: string | null;
  reservable: boolean;
  ficha: VehicleFacts;
  moneda: 'USD';
  estado_operativo: 'operativo';
  descripcion: string | null;
  imagen_url: string | null;
  categoria: CatalogOption;
  marca: CatalogOption;
  modelo: CatalogOption;
  ubicacion: {
    id: number;
    nombre: string;
    tipo: 'sucursal' | 'punto_autorizado';
    direccion: string;
    latitud: string;
    longitud: string;
  } | null;
  // Sin fechas, el estado operativo no basta para asegurar disponibilidad.
  disponible: boolean | null;
}

export interface VehicleList {
  vehicles: Vehicle[];
  total: number;
}

export interface VehiclePeriodResponse {
  inicio_utc: string;
  fin_utc: string;
}
