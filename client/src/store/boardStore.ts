import { create } from "zustand";
import {
  ACTIVITY_LIMIT,
  TOTAL_CELLS,
  type ActivityItem,
  type BoardSnapshot,
  type CellState,
  type PublicUser,
} from "@gridrush/shared";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

interface ClaimUpdate {
  cell: CellState;
  owner: PublicUser;
}

interface BoardState {
  me: PublicUser | null;
  /** Index = cellId. null = unclaimed. Replaced (not mutated) on change so selectors stay cheap. */
  cells: (CellState | null)[];
  owners: Record<string, PublicUser>;
  activity: ActivityItem[];
  /** Cells this tab has a claim request in flight for. */
  pending: Record<number, true>;
  /** Most recent capture seen live; `flash` changes on every capture to restart the animation. */
  latest: { cellId: number; flash: number } | null;
  online: number;
  connection: ConnectionStatus;
  hasSnapshot: boolean;

  setMe(user: PublicUser | null): void;
  setConnection(status: ConnectionStatus): void;
  setOnline(n: number): void;
  setPending(cellId: number, on: boolean): void;
  /** Replace local state with the server's. Events newer than the snapshot are re-applied by the caller. */
  applySnapshot(snapshot: BoardSnapshot): void;
  /** Apply one ownership change if it's newer than what we have. Returns true if anything changed. */
  applyClaim(update: ClaimUpdate, opts?: { animate?: boolean }): boolean;
  reset(): void;
}

const emptyCells = () => Array.from<CellState | null>({ length: TOTAL_CELLS }).fill(null);

export const useBoardStore = create<BoardState>()((set, get) => ({
  me: null,
  cells: emptyCells(),
  owners: {},
  activity: [],
  pending: {},
  latest: null,
  online: 0,
  connection: "connecting",
  hasSnapshot: false,

  setMe: (me) => set({ me }),
  setConnection: (connection) => set({ connection }),
  setOnline: (online) => set({ online }),

  setPending: (cellId, on) =>
    set((s) => {
      if (on === Boolean(s.pending[cellId])) return s;
      const pending = { ...s.pending };
      if (on) pending[cellId] = true;
      else delete pending[cellId];
      return { pending };
    }),

  applySnapshot: (snapshot) => {
    const prev = get().cells;
    const cells = emptyCells();
    for (const c of snapshot.cells) {
      // Keep the existing object when nothing changed, so those tiles don't re-render.
      const old = prev[c.cellId];
      cells[c.cellId] = old && old.version === c.version && old.ownerId === c.ownerId ? old : c;
    }
    set((s) => ({
      cells,
      owners: { ...s.owners, ...snapshot.owners },
      activity: snapshot.activity,
      hasSnapshot: true,
    }));
  },

  applyClaim: ({ cell, owner }, opts = {}) => {
    const current = get().cells[cell.cellId];
    // Drop duplicates and out-of-order events: versions only move forward.
    if (current && current.version >= cell.version) return false;

    set((s) => {
      const cells = s.cells.slice();
      cells[cell.cellId] = cell;

      const owners = s.owners[owner.id] === undefined ? { ...s.owners, [owner.id]: owner } : s.owners;

      let activity = s.activity;
      if (cell.claimedAt && !activity.some((a) => a.cellId === cell.cellId && a.version === cell.version)) {
        activity = [
          { cellId: cell.cellId, owner, claimedAt: cell.claimedAt, version: cell.version },
          ...activity,
        ].slice(0, ACTIVITY_LIMIT);
      }

      return {
        cells,
        owners,
        activity,
        latest: opts.animate ? { cellId: cell.cellId, flash: (s.latest?.flash ?? 0) + 1 } : s.latest,
      };
    });
    return true;
  },

  reset: () =>
    set({
      cells: emptyCells(),
      owners: {},
      activity: [],
      pending: {},
      latest: null,
      online: 0,
      hasSnapshot: false,
      connection: "connecting",
    }),
}));
