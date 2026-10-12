import { memo, type CSSProperties } from "react";
import { formatCell } from "@gridrush/shared";
import { useBoardStore } from "@/store/boardStore";

interface TileProps {
  cellId: number;
  /** Roving tabindex: only one tile in the grid is in the tab order. */
  tabbable: boolean;
}

/**
 * One board cell. Memoized and subscribed only to its own slice of the store,
 * so a claim re-renders exactly one tile instead of all 900.
 */
export const Tile = memo(function Tile({ cellId, tabbable }: TileProps) {
  const cell = useBoardStore((s) => s.cells[cellId]);
  const owner = useBoardStore((s) => (cell?.ownerId ? s.owners[cell.ownerId] : undefined));
  const pending = useBoardStore((s) => s.pending[cellId] === true);
  const flash = useBoardStore((s) => (s.latest?.cellId === cellId ? s.latest.flash : 0));
  const mine = useBoardStore((s) => Boolean(cell?.ownerId && cell.ownerId === s.me?.id));

  const owned = Boolean(cell?.ownerId);
  const state = owned ? "owned" : pending ? "pending" : "free";
  const coords = formatCell(cellId);
  const label = owned
    ? `Cell ${coords}, owned by ${mine ? "you" : (owner?.displayName ?? "another player")}`
    : pending
      ? `Cell ${coords}, claiming`
      : `Cell ${coords}, free`;

  return (
    <button
      type="button"
      role="gridcell"
      className="tile"
      data-cell={cellId}
      data-state={state}
      data-mine={mine || undefined}
      data-latest={flash > 0 || undefined}
      aria-label={label}
      aria-disabled={owned || pending}
      aria-busy={pending || undefined}
      tabIndex={tabbable ? 0 : -1}
      style={owner ? ({ "--owner": owner.color } as CSSProperties) : undefined}
    >
      {flash > 0 && owned && <span key={flash} className="flash" aria-hidden />}
    </button>
  );
});
