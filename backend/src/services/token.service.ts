import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error.js';

export interface TokenConfig {
  secret: string;
  expiresInSeconds: number;
}

const ISSUER = 'autorent-api';
const AUDIENCE = 'autorent-mobile';
const MAX_USER_ID = 4_294_967_295;

function invalidToken(): ApiError {
  return new ApiError(401, 'INVALID_TOKEN', 'El token no es válido o ha expirado. Inicia sesión nuevamente.');
}

export class TokenService {
  readonly expiresInSeconds: number;
  private readonly secret: string;

  constructor(config: TokenConfig) {
    this.secret = config.secret;
    this.expiresInSeconds = config.expiresInSeconds;
  }

  sign(userId: number): string {
    if (!Number.isInteger(userId) || userId < 1 || userId > MAX_USER_ID) {
      throw new Error('No se puede emitir un token para un identificador de usuario inválido.');
    }
    return jwt.sign({}, this.secret, {
      algorithm: 'HS256',
      subject: String(userId),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: this.expiresInSeconds,
    });
  }

  verify(token: string): number {
    try {
      if (token.length === 0 || token.length > 4_096) {
        throw invalidToken();
      }
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        maxAge: this.expiresInSeconds,
      });
      const now = Math.floor(Date.now() / 1_000);
      if (typeof payload === 'string'
        || typeof payload.sub !== 'string'
        || !/^[1-9]\d{0,9}$/.test(payload.sub)
        || payload.iss !== ISSUER
        || payload.aud !== AUDIENCE
        || typeof payload.exp !== 'number'
        || !Number.isSafeInteger(payload.exp)
        || typeof payload.iat !== 'number'
        || !Number.isSafeInteger(payload.iat)
        || payload.iat > now
        || payload.exp <= payload.iat
        || payload.exp - payload.iat > this.expiresInSeconds) {
        throw invalidToken();
      }
      const userId = Number(payload.sub);
      if (userId < 1 || userId > MAX_USER_ID || String(userId) !== payload.sub) {
        throw invalidToken();
      }
      return userId;
    } catch {
      // No se devuelve el token ni el detalle criptográfico de la verificación.
      throw invalidToken();
    }
  }
}
