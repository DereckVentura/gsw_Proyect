import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';

interface CountRow extends RowDataPacket { requests: number }
export function distributedAuthLimiter(database: DatabaseConnectionProvider): RequestHandler {
  return async (request, response, next) => {
    const windowSeconds = 900;
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / windowSeconds) * windowSeconds;
    const key = createHash('sha256').update(`auth:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`).digest('hex');
    const count = await database.withConnection(async (connection) => {
      await connection.execute('INSERT INTO api_rate_limits (key_hash, window_start, requests) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE requests = requests + 1', [key, window]);
      const [rows] = await connection.execute<CountRow[]>('SELECT requests FROM api_rate_limits WHERE key_hash = ? AND window_start = ?', [key, window]);
      // Limpieza acotada; todas las instancias comparten los mismos contadores.
      await connection.execute('DELETE FROM api_rate_limits WHERE window_start < ? LIMIT 100', [window - 3600]);
      return rows[0]!.requests;
    });
    response.setHeader('RateLimit-Limit', '30');
    response.setHeader('RateLimit-Remaining', String(Math.max(0, 30 - count)));
    if (count > 30) {
      response.setHeader('Retry-After', String(window + windowSeconds - now));
      response.status(429).json({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' } });
      return;
    }
    next();
  };
}
