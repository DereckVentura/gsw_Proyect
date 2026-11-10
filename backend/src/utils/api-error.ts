export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
