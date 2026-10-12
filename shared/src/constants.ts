/** Board is GRID_SIZE x GRID_SIZE. Cell ids are 0-based, row-major: id = row * GRID_SIZE + col. */
export const GRID_SIZE = 30;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

/** Socket.IO room every subscribed client joins. */
export const BOARD_ROOM = "board";

/** How many recent captures the activity feed keeps. */
export const ACTIVITY_LIMIT = 20;

/**
 * Player colors. Chosen to be distinguishable from each other and readable
 * on both light and dark backgrounds. Users get one at random on sign-up.
 */
export const PLAYER_COLORS = [
  "#e11d48", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#84cc16", // lime
  "#16a34a", // green
  "#0d9488", // teal
  "#06b6d4", // cyan
  "#2563eb", // blue
  "#1e3a8a", // navy
  "#7c3aed", // violet
  "#c026d3", // magenta
  "#f472b6", // pink
  "#a16207", // ochre
  "#78350f", // brown
] as const;

/** Convert a cell id to 0-based column/row. */
export function cellIdToCoords(cellId: number): { col: number; row: number } {
  return { col: cellId % GRID_SIZE, row: Math.floor(cellId / GRID_SIZE) };
}

/** Human-facing label, 1-based: "(x, y)" where x is the column and y the row. */
export function formatCell(cellId: number): string {
  const { col, row } = cellIdToCoords(cellId);
  return `(${col + 1}, ${row + 1})`;
}

export function isValidCellId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < TOTAL_CELLS;
}
