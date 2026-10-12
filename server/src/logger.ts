import pino from "pino";

export function createLogger(level: string, pretty: boolean) {
  return pino({
    level,
    redact: ["req.headers.authorization", "token"],
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
