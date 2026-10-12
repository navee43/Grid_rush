import type { ActivityItem, BoardSnapshot, ErrorCode, PublicUser } from "./types.js";

/** Socket.IO event names. One place, so client and server can't drift. */
export const SocketEvents = {
  /** client -> server: join the board room and request a fresh snapshot. */
  BoardSubscribe: "board:subscribe",
  /** server -> client: full current state (sent on subscribe and every reconnect). */
  BoardSnapshot: "board:snapshot",
  /** server -> clients: one cell changed owner. Emitted only after the DB confirms. */
  CellClaimed: "cell:claimed",
  /** server -> clients: how many players are online right now. */
  UserPresence: "user:presence",
  /** server -> client: something went wrong handling a socket request. */
  BoardError: "board:error",
} as const;

export interface CellClaimedPayload extends ActivityItem {
  /** Same as owner.id, kept flat for convenience. */
  ownerId: string;
}

export interface PresencePayload {
  online: number;
}

export interface BoardErrorPayload {
  code: ErrorCode;
  message: string;
}

export interface ServerToClientEvents {
  "board:snapshot": (snapshot: BoardSnapshot) => void;
  "cell:claimed": (payload: CellClaimedPayload) => void;
  "user:presence": (payload: PresencePayload) => void;
  "board:error": (payload: BoardErrorPayload) => void;
}

export interface ClientToServerEvents {
  /** Optional ack lets the client know the snapshot was sent. */
  "board:subscribe": (ack?: (ok: boolean) => void) => void;
}

export interface SocketData {
  user: PublicUser;
}

export type { PublicUser };
