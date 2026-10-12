import type { ErrorCode } from "@gridrush/shared";

/** An error that maps cleanly to an HTTP status and a stable error code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static unauthorized(message = "Your session is missing or has expired. Please rejoin.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static notFound(message = "Not found") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static validation(message: string, details?: unknown) {
    return new AppError(400, "VALIDATION_ERROR", message, details);
  }
}
