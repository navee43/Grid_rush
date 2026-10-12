import { GRID_SIZE, cellIdToCoords, formatCell } from "@gridrush/shared";
import { useBoardStore } from "@/store/boardStore";
import { cn, timeAgo } from "@/lib/utils";

/**
 * A single tooltip shared by all 900 tiles, positioned with percentages from the
 * cell's row/column — no DOM measurement, no per-tile tooltip components.
 */
export function CellTooltip({ cellId }: { cellId: number }) {
  const cell = useBoardStore((s) => s.cells[cellId]);
  const owner = useBoardStore((s) => (cell?.ownerId ? s.owners[cell.ownerId] : undefined));
  const pending = useBoardStore((s) => s.pending[cellId] === true);
  const meId = useBoardStore((s) => s.me?.id);
  const { col, row } = cellIdToCoords(cellId);

  const below = row < 3;
  const align = col < 4 ? "start" : col > GRID_SIZE - 5 ? "end" : "center";
  const left = `${((col + 0.5) / GRID_SIZE) * 100}%`;
  const top = `${((below ? row + 1 : row) / GRID_SIZE) * 100}%`;

  let title: string;
  let detail: string;
  if (owner && cell?.claimedAt) {
    title = owner.id === meId ? "Yours" : owner.displayName;
    detail = `Claimed ${timeAgo(cell.claimedAt)}`;
  } else if (pending) {
    title = "Claiming…";
    detail = "Waiting for the server";
  } else {
    title = "Free";
    detail = "Click or press Enter to claim";
  }

  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 w-max max-w-[220px] rounded-[10px] border border-line bg-surface px-3 py-2 text-left shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)]",
        below ? "mt-2" : "-translate-y-full -mt-2",
        align === "center" && "-translate-x-1/2",
        align === "end" && "-translate-x-full",
      )}
      style={{ left, top }}
    >
      <div className="flex items-center gap-2">
        {owner ? (
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: owner.color }} aria-hidden />
        ) : (
          <span className="size-2.5 shrink-0 rounded-[3px] border border-line-strong" aria-hidden />
        )}
        <span className="truncate text-sm font-semibold text-ink">{title}</span>
        <span className="tabular ml-auto pl-2 text-xs text-faint">{formatCell(cellId)}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">{detail}</div>
    </div>
  );
}
