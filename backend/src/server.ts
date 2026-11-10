import type { Server } from 'node:http';
import { createApp } from './app.js';
import { Database } from './config/database.js';
import { ConfigurationError, loadEnvironment, type AppConfig } from './config/env.js';
import { MySqlHealthRepository } from './repositories/health.repository.js';
import { HealthService } from './services/health.service.js';
import { MySqlUserRepository } from './repositories/user.repository.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import { AuthService } from './services/auth.service.js';
import { MySqlVehicleRepository } from './repositories/vehicle.repository.js';
import { VehicleService } from './services/vehicle.service.js';
import { MySqlFleetRepository } from './repositories/fleet.repository.js';
import { FleetService } from './services/fleet.service.js';
import { MySqlBookingRepository } from './repositories/booking.repository.js';
import { BookingService } from './services/booking.service.js';
import { parseDeployment } from './config/deployment.js';
import { distributedAuthLimiter } from './middlewares/distributed-limit.middleware.js';
import { LegalService } from './services/legal.service.js';

function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)) {
      return code;
    }
  }
  return 'STARTUP_ERROR';
}

function startServer(): void {
  let config: AppConfig;
  let deployment: ReturnType<typeof parseDeployment>;
  try {
    config = loadEnvironment();
    deployment = parseDeployment(process.env);
  } catch (error) {
    const hint = error instanceof ConfigurationError
      ? error.message
      : 'Revisa las variables de backend/.env y la guía de configuración.';
    console.error(`[autorent-api] CONFIGURATION_ERROR. ${hint}`);
    process.exitCode = 1;
    return;
  }

  const database = new Database(config.database, deployment);
  const repository = new MySqlHealthRepository(database);
  const service = new HealthService(repository);
  const legal = new LegalService(database);
  const authService = new AuthService(
    new MySqlUserRepository(database),
    new PasswordService(),
    new TokenService(config.auth),
    legal,
  );
  const vehicleService = new VehicleService(new MySqlVehicleRepository(database));
  const app = createApp(service, authService, vehicleService, new FleetService(new MySqlFleetRepository(database)), new BookingService(new MySqlBookingRepository(database, legal)), { deployment, authLimiter: distributedAuthLimiter(database), legal });
  let server: Server;
  let shutdownStarted = false;

  const shutdown = (exitCode: number): void => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    process.exitCode = exitCode;
    console.info('[autorent-api] Cerrando el servidor.');

    const deadline = setTimeout(() => {
      console.error('[autorent-api] SHUTDOWN_TIMEOUT');
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    deadline.unref();

    server.close(() => {
      void database.close().then(
        () => {
          clearTimeout(deadline);
          console.info('[autorent-api] Servidor cerrado.');
        },
        () => {
          clearTimeout(deadline);
          console.error('[autorent-api] DATABASE_CLOSE_ERROR');
          process.exitCode = 1;
        },
      );
    });
    server.closeIdleConnections();
  };

  // La conexión con MySQL se comprueba en /database: una caída no impide iniciar HTTP.
  server = app.listen(config.port, config.host);
  server.once('listening', () => {
    console.info(`[autorent-api] Servidor disponible en http://${config.host}:${config.port}`);
    console.info('[autorent-api] Estado: /api/v1/health | MySQL: /api/v1/health/database');
  });

  server.on('error', (error: unknown) => {
    const code = safeErrorCode(error);
    if (code === 'EADDRINUSE') {
      console.error('[autorent-api] EADDRINUSE. El puerto está ocupado; revisa PORT en backend/.env.');
    } else {
      console.error(`[autorent-api] ${code}. No se pudo iniciar o mantener el servidor.`);
    }
    shutdown(1);
  });

  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));
}

startServer();
