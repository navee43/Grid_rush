import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GRID_SIZE, TOTAL_CELLS } from "@gridrush/shared";
import { Tile } from "./Tile";
import { CellTooltip } from "./CellTooltip";
import { useBoardStore } from "@/store/boardStore";

const ROWS = Array.from({ length: GRID_SIZE }, (_, r) => r);
const COLS = Array.from({ length: GRID_SIZE }, (_, c) => c);
const CENTER = Math.floor(GRID_SIZE / 2) * GRID_SIZE + Math.floor(GRID_SIZE / 2);

function cellFromTarget(target: EventTarget | null): number | null {
  const el = (target as HTMLElement | null)?.closest?.("[data-cell]");
  if (!el) return null;
  const id = Number(el.getAttribute("data-cell"));
  return Number.isInteger(id) ? id : null;
}

interface BoardProps {
  onClaim(cellId: number): void;
}

/**
 * The 30×30 board. All pointer and keyboard handling is delegated to the grid
 * element, so there are no 900 sets of event handlers. Keyboard: arrow keys move,
 * Home/End jump within a row, Enter or Space claims.
 */
export function Board({ onClaim }: BoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState(CENTER);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [keyboardTip, setKeyboardTip] = useState(false);
  const hasSnapshot = useBoardStore((s) => s.hasSnapshot);

  const focusCell = useCallback((id: number) => {
    setFocusId(id);
    setKeyboardTip(true);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${id}"]`)?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = cellFromTarget(e.target);
    if (current === null) return;
    const col = current % GRID_SIZE;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        next = col < GRID_SIZE - 1 ? current + 1 : current;
        break;
      case "ArrowLeft":
        next = col > 0 ? current - 1 : current;
        break;
      case "ArrowDown":
        next = current + GRID_SIZE < TOTAL_CELLS ? current + GRID_SIZE : current;
        break;
      case "ArrowUp":
        next = current - GRID_SIZE >= 0 ? current - GRID_SIZE : current;
        break;
      case "Home":
        next = e.ctrlKey ? 0 : current - col;
        break;
      case "End":
        next = e.ctrlKey ? TOTAL_CELLS - 1 : current - col + GRID_SIZE - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onClaim(current);
        return;
      case "Escape":
        setKeyboardTip(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    focusCell(next);
  };

  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    const id = cellFromTarget(e.target);
    if (id !== null) {
      setHoverId(id);
      setKeyboardTip(false);
    }
  };

  const tipId = hoverId ?? (keyboardTip ? focusId : null);

  return (
    <div className="slab rounded-[20px] p-2 sm:p-3">
      <div className="relative">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Shared board, 30 by 30 cells"
          aria-rowcount={GRID_SIZE}
          aria-colcount={GRID_SIZE}
          className="relative flex flex-col gap-px sm:gap-[2px]"
          onClick={(e) => {
            const id = cellFromTarget(e.target);
            if (id !== null) {
              setFocusId(id);
              onClaim(id);
            }
          }}
          onPointerOver={onPointerOver}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHoverId(null)}
          onFocus={(e) => {
            const id = cellFromTarget(e.target);
            if (id !== null) setFocusId(id);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardTip(false);
          }}
          onKeyDown={onKeyDown}
        >
          {ROWS.map((r) => (
            <div key={r} role="row" aria-rowindex={r + 1} className="grid grid-cols-30 gap-px sm:gap-[2px]">
              {COLS.map((c) => {
                const id = r * GRID_SIZE + c;
                return <Tile key={id} cellId={id} tabbable={id === focusId} />;
              })}
            </div>
          ))}
        </div>

        {tipId !== null && hasSnapshot && <CellTooltip cellId={tipId} />}

        {!hasSnapshot && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-slab/60 backdrop-blur-[1px]">
            <span className="rounded-full bg-surface px-3 py-1.5 text-sm text-muted shadow-sm">Loading the board…</span>
          </div>
        )}
      </div>
    </div>
  );
}
