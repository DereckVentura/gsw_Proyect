import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

export class PasswordService {
  private readonly dummyHash: Promise<string>;

  constructor() {
    // El hash señuelo se genera al arrancar y nunca representa una cuenta real.
    this.dummyHash = bcrypt.hash(randomBytes(32).toString('base64'), BCRYPT_COST);
    // Si falla la inicialización, burnDummy propagará el error al utilizarlo.
    void this.dummyHash.catch(() => undefined);
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async burnDummy(password: string): Promise<void> {
    // Comprobar también usuarios ausentes o inactivos evita omitir el trabajo de bcrypt.
    await bcrypt.compare(password, await this.dummyHash);
  }
}
