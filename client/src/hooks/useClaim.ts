import { useCallback } from "react";
import { toast } from "sonner";
import { formatCell, type CellTakenDetails } from "@gridrush/shared";
import { ApiError, api } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";

/**
 * Claim flow: mark the tile pending, ask the server, then show the server's answer.
 * No optimistic ownership — the tile only turns your color once the database confirms.
 */
export function useClaim(onUnauthorized: () => void) {
  return useCallback(
    async (cellId: number) => {
      const s = useBoardStore.getState();
      if (!s.me) return;
      if (s.pending[cellId]) return; // already in flight: ignore repeat clicks
      const existing = s.cells[cellId];
      if (existing?.ownerId) return; // already owned (by anyone): nothing to do

      s.setPending(cellId, true);
      try {
        const res = await api.claimCell(cellId);
        // Usually the socket event arrives first; the version check makes this a no-op then.
        useBoardStore.getState().applyClaim({ cell: res.cell, owner: res.owner }, { animate: true });
      } catch (err) {
        if (err instanceof ApiError && err.code === "CELL_TAKEN") {
          const details = err.details as CellTakenDetails | undefined;
          if (details?.owner) {
            useBoardStore.getState().applyClaim({ cell: details.cell, owner: details.owner });
          }
          toast(`${details?.owner?.displayName ?? "Someone"} got ${formatCell(cellId)} first.`, {
            description: "Pick another free cell.",
          });
        } else if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
        } else if (err instanceof ApiError && err.code === "RATE_LIMITED") {
          toast.warning("Slow down a little.", { description: err.message });
        } else {
          toast.error(`Couldn't claim ${formatCell(cellId)}.`, {
            description: err instanceof Error ? err.message : "Try again.",
          });
        }
      } finally {
        useBoardStore.getState().setPending(cellId, false);
      }
    },
    [onUnauthorized],
  );
}
