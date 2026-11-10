import type { StoredUser, User } from '../models/user.model.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { ApiError } from '../utils/api-error.js';
import type { LoginInput, RegisterInput } from '../validators/auth.validator.js';
import type { PasswordService } from './password.service.js';
import type { TokenService } from './token.service.js';
import type { LegalService } from './legal.service.js';

function publicUser(user: User): User {
  return {
    id: user.id,
    nombres: user.nombres,
    apellidos: user.apellidos,
    email: user.email,
    telefono: user.telefono,
    rol: user.rol,
  };
}

function invalidCredentials(): ApiError {
  return new ApiError(401, 'INVALID_CREDENTIALS', 'El correo electrónico o la contraseña no son correctos.');
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: Pick<PasswordService, 'hash' | 'verify' | 'burnDummy'>,
    private readonly tokens: Pick<TokenService, 'sign' | 'verify' | 'expiresInSeconds'>,
    private readonly legal?: LegalService,
  ) {}

  async register(input: RegisterInput): Promise<{ user: User }> {
    const acceptance = this.legal ? await this.legal.acceptance(input.aceptacion) : undefined;
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.createClient({
      nombres: input.nombres,
      apellidos: input.apellidos,
      email: input.email,
      telefono: input.telefono,
      passwordHash,
      ...(acceptance ? { acceptance } : {}),
    });
    return { user: publicUser(user) };
  }

  async login(input: LoginInput): Promise<{
    user: User;
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
  }> {
    const user: StoredUser | null = await this.users.findByEmail(input.email);
    if (user === null || !user.activo) {
      await this.passwords.burnDummy(input.password);
      throw invalidCredentials();
    }
    if (!await this.passwords.verify(input.password, user.passwordHash)) {
      throw invalidCredentials();
    }
    return {
      user: publicUser(user),
      accessToken: this.tokens.sign(user.id),
      tokenType: 'Bearer',
      expiresIn: this.tokens.expiresInSeconds,
    };
  }

  async authenticate(token: string): Promise<User> {
    const userId = this.tokens.verify(token);
    // Consultar cada vez permite revocar el acceso al desactivar una cuenta.
    const user = await this.users.findById(userId);
    if (user === null || !user.activo) {
      throw new ApiError(401, 'INVALID_TOKEN', 'El token no es válido o ha expirado. Inicia sesión nuevamente.');
    }
    return publicUser(user);
  }
}
