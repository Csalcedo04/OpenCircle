export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    // Safe, client-facing data that helps fix the request (e.g. the nearest valid values).
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
