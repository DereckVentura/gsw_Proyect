export interface HealthStatus {
  service: 'autorent-api';
  status: 'ok';
  timestamp: string;
}

export interface DatabaseHealthStatus extends HealthStatus {
  database: 'connected';
}
