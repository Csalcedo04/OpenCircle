export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    // Extra fields the client can act on (e.g. valid alternatives); never PII or secrets.
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
