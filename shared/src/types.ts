/** Public view of a player. Never includes session secrets. */
export interface PublicUser {
  id: string;
  displayName: string;
  color: string;
}

/** A cell as sent over the wire. Unclaimed cells are omitted from snapshots. */
export interface CellState {
  cellId: number;
  ownerId: string | null;
  /** ISO timestamp, null while unclaimed. */
  claimedAt: string | null;
  /** Increments on every ownership change. Clients ignore updates with a lower or equal version. */
  version: number;
}

export interface ActivityItem {
  cellId: number;
  owner: PublicUser;
  claimedAt: string;
  version: number;
}

export interface BoardSnapshot {
  gridSize: number;
  /** Only claimed cells — unclaimed is the default. */
  cells: CellState[];
  /** Everyone who owns at least one cell, keyed by id. */
  owners: Record<string, PublicUser>;
  /** Most recent captures, newest first. */
  activity: ActivityItem[];
  serverTime: string;
}

export interface LeaderboardEntry {
  rank: number;
  user: PublicUser;
  cells: number;
  /** Share of the whole board, 0–100. */
  percent: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalClaimed: number;
  totalCells: number;
  totalOwners: number;
}

export interface SessionResponse {
  user: PublicUser;
  /** Only returned when the session is created. Store it; it is the user's credential. */
  token?: string;
}

export interface ClaimResponse {
  cell: CellState;
  owner: PublicUser;
  /** True when the caller already owned the cell (an idempotent retry). */
  alreadyOwned: boolean;
}

/** Error envelope used by every non-2xx REST response and by `board:error`. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CELL_TAKEN"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

/** Extra detail on a 409 CELL_TAKEN so the client can show the real owner immediately. */
export interface CellTakenDetails {
  cell: CellState;
  owner: PublicUser | null;
}
