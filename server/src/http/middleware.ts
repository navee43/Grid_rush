import type { NextFunction, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { ZodError, type ZodTypeAny, type z } from "zod";
import type { ApiErrorBody, PublicUser } from "@gridrush/shared";
import { AppError } from "../errors.js";
import { authenticate, hashToken } from "../services/sessionService.js";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: PublicUser;
  }
}

/** Wrap async handlers so rejected promises reach the error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

/** Requires a valid session; sets req.user. */
export const requireUser: RequestHandler = asyncHandler(async (req, _res, next) => {
  const user = await authenticate(bearerToken(req));
  if (!user) throw AppError.unauthorized();
  req.user = user;
  next();
});

/** Parse and validate part of the request; the parsed value replaces the raw one. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw AppError.validation(first?.message ?? "Invalid request", result.error.flatten());
  }
  return result.data;
}

function sendError(res: Response, status: number, body: ApiErrorBody) {
  res.status(status).json(body);
}

function limiter(
  config: Config,
  opts: { windowMs: number; limit: number; key?: (req: Request) => string; message: string },
) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.RATE_LIMIT_DISABLED,
    ...(opts.key ? { keyGenerator: opts.key } : {}),
    handler: (_req, res) => sendError(res, 429, { error: { code: "RATE_LIMITED", message: opts.message } }),
  });
}

export function createRateLimiters(config: Config) {
  return {
    api: limiter(config, {
      windowMs: config.API_RATE_WINDOW_MS,
      limit: config.API_RATE_LIMIT,
      message: "Too many requests. Please slow down.",
    }),
    session: limiter(config, {
      windowMs: config.SESSION_RATE_WINDOW_MS,
      limit: config.SESSION_RATE_LIMIT,
      message: "Too many new players from this network. Try again in a few minutes.",
    }),
    // Keyed by session (hashed), so players behind one NAT don't throttle each other.
    claim: limiter(config, {
      windowMs: config.CLAIM_RATE_WINDOW_MS,
      limit: config.CLAIM_RATE_LIMIT,
      key: (req) => {
        const token = bearerToken(req);
        return token ? `t:${hashToken(token)}` : `ip:${req.ip}`;
      },
      message: "You're clicking faster than the board can keep up. Wait a moment.",
    }),
  };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  sendError(res, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
};

/** One place that turns any thrown error into the standard error envelope. */
export function createErrorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    if (err instanceof AppError) {
      return sendError(res, err.status, {
        error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
      });
    }
    if (err instanceof ZodError) {
      return sendError(res, 400, {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0]?.message ?? "Invalid request",
          details: err.flatten(),
        },
      });
    }
    // Errors raised by express.json()
    const type = (err as { type?: string })?.type;
    if (type === "entity.too.large") {
      return sendError(res, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
    }
    if (type === "entity.parse.failed") {
      return sendError(res, 400, { error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON" } });
    }

    logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
    return sendError(res, 500, { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } });
  };
}
