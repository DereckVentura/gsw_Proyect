import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { parseLoginInput, parseRegisterInput } from '../validators/auth.validator.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  readonly register: RequestHandler = async (request, response) => {
    const result = await this.service.register(parseRegisterInput(request.body as unknown));
    response.status(201).json({ success: true, data: result });
  };

  readonly login: RequestHandler = async (request, response) => {
    const result = await this.service.login(parseLoginInput(request.body as unknown));
    response.json({ success: true, data: result });
  };

  readonly me: RequestHandler = (_request, response) => {
    response.json({ success: true, data: { user: response.locals.user as unknown } });
  };
}
