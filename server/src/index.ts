import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { connectDatabase, disconnectDatabase } from "./db/connect.js";
import { ensureBoard } from "./services/boardService.js";
import { createGridServer } from "./server.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === "development");

  await connectDatabase(config.MONGODB_URI, logger);
  const { created } = await ensureBoard();
  logger.info({ created }, created ? "Board initialized" : "Board already initialized");

  const server = createGridServer(config, logger);
  const port = await server.listen(config.PORT);
  logger.info({ port, origins: config.clientOrigins }, "GridRush API listening");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    await server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
