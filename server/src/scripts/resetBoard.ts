/**
 * Clear every cell's owner. Users are kept.
 *   npm run board:reset -w server             (dev, via tsx)
 *   node server/dist/scripts/resetBoard.js    (after build)
 * Restart the API afterwards (or let clients reconnect) so open tabs fetch a fresh snapshot.
 */
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { connectDatabase, disconnectDatabase } from "../db/connect.js";
import { ensureBoard, resetBoard } from "../services/boardService.js";

const config = loadConfig();
const logger = createLogger("info", false);

await connectDatabase(config.MONGODB_URI, logger);
await ensureBoard();
await resetBoard();
logger.info("Board reset: all cells are unclaimed");
await disconnectDatabase();
