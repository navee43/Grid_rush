import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  BOARD_ROOM,
  SocketEvents,
  type CellClaimedPayload,
  type ClientToServerEvents,
  type PublicUser,
  type ServerToClientEvents,
  type SocketData,
} from "@gridrush/shared";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import { authenticate, touchUser } from "../services/sessionService.js";
import { getSnapshot } from "../services/boardService.js";
import { PresenceTracker } from "../services/presenceService.js";

export type GridIO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GridSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** What the HTTP layer needs from the real-time layer. Keeps controllers free of Socket.IO details. */
export interface Broadcaster {
  cellClaimed(payload: CellClaimedPayload): void;
}

/** Minimum gap between snapshot requests from one socket. */
const SUBSCRIBE_COOLDOWN_MS = 1_000;

export function createRealtime(httpServer: HttpServer, config: Config, logger: Logger) {
  const io: GridIO = new Server(httpServer, {
    cors: { origin: config.clientOrigins, credentials: false },
    // Clients never send large payloads; reject anything suspicious early.
    maxHttpBufferSize: 10_000,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // No connectionStateRecovery: every (re)connect asks for a fresh snapshot instead,
    // which is simpler to reason about and cheap for a 900-cell board.
  });

  const presence = new PresenceTracker();

  const emitPresence = () => io.emit(SocketEvents.UserPresence, { online: presence.onlineCount });

  // Every socket must present a valid session token in the handshake.
  io.use(async (socket, next) => {
    try {
      const user = await authenticate(socket.handshake.auth?.token);
      if (!user) return next(new Error("UNAUTHORIZED"));
      socket.data.user = user;
      next();
    } catch (err) {
      logger.error({ err }, "Socket auth failed");
      next(new Error("INTERNAL_ERROR"));
    }
  });

  io.on("connection", (socket: GridSocket) => {
    const user: PublicUser = socket.data.user;
    presence.add(user.id, socket.id);
    emitPresence();
    touchUser(user.id).catch((err) => logger.warn({ err }, "touchUser failed"));
    logger.debug({ user: user.id, socket: socket.id }, "socket connected");

    let lastSubscribeAt = 0;

    socket.on(SocketEvents.BoardSubscribe, async (ack) => {
      const now = Date.now();
      if (now - lastSubscribeAt < SUBSCRIBE_COOLDOWN_MS) {
        socket.emit(SocketEvents.BoardError, {
          code: "RATE_LIMITED",
          message: "Slow down — snapshot requested too often.",
        });
        if (typeof ack === "function") ack(false);
        return;
      }
      lastSubscribeAt = now;

      try {
        // Join BEFORE reading the snapshot. Any claim that lands in between is
        // delivered as an event too, and the client keeps whichever version is newer.
        await socket.join(BOARD_ROOM);
        const snapshot = await getSnapshot();
        socket.emit(SocketEvents.BoardSnapshot, snapshot);
        socket.emit(SocketEvents.UserPresence, { online: presence.onlineCount });
        if (typeof ack === "function") ack(true);
      } catch (err) {
        logger.error({ err }, "Failed to build snapshot");
        socket.emit(SocketEvents.BoardError, {
          code: "INTERNAL_ERROR",
          message: "Could not load the board. Retrying…",
        });
        if (typeof ack === "function") ack(false);
      }
    });

    socket.on("disconnect", (reason) => {
      presence.remove(user.id, socket.id);
      emitPresence();
      touchUser(user.id).catch(() => undefined);
      logger.debug({ user: user.id, reason }, "socket disconnected");
    });
  });

  const broadcaster: Broadcaster = {
    cellClaimed(payload) {
      io.to(BOARD_ROOM).emit(SocketEvents.CellClaimed, payload);
    },
  };

  return { io, broadcaster, presence };
}
