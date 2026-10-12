import { createServer, type Server as HttpServer } from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import { createApiRouter } from "./http/routes.js";
import { createErrorHandler, notFoundHandler } from "./http/middleware.js";
import { createRealtime, type GridIO } from "./realtime/socket.js";

export interface GridServer {
  app: express.Express;
  httpServer: HttpServer;
  io: GridIO;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

/**
 * Build the HTTP + Socket.IO server without touching the database connection.
 * index.ts connects to MongoDB first; tests do the same against a test database.
 */
export function createGridServer(config: Config, logger: Logger): GridServer {
  const app = express();
  const httpServer = createServer(app);
  const { io, broadcaster } = createRealtime(httpServer, config, logger);

  app.disable("x-powered-by");
  if (config.TRUST_PROXY > 0) app.set("trust proxy", config.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({ origin: config.clientOrigins, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }),
  );
  app.use(compression());
  app.use(express.json({ limit: "2kb" }));

  app.use("/api", createApiRouter(config, broadcaster));
  app.get("/", (_req, res) => res.json({ name: "GridRush API", health: "/api/health" }));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return {
    app,
    httpServer,
    io,
    listen(port) {
      return new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, () => {
          const addr = httpServer.address();
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      });
    },
    async close() {
      // io.close() also closes the underlying HTTP server.
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
