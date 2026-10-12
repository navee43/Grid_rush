import { Schema, model, type Types } from "mongoose";
import type { CellState } from "@gridrush/shared";

const cellSchema = new Schema(
  {
    /** 0-based, row-major: cellId = row * GRID_SIZE + col. */
    cellId: { type: Number, required: true, min: 0 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    claimedAt: { type: Date, default: null },
    /** Bumped on every ownership change; lets clients drop stale or out-of-order events. */
    version: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

// The unique index is what makes "one document per cell" a database guarantee,
// not just an application convention.
cellSchema.index({ cellId: 1 }, { unique: true });
// Leaderboard grouping and "my cells" lookups.
cellSchema.index({ ownerId: 1 });
// Recent activity.
cellSchema.index({ claimedAt: -1 });

export interface CellDoc {
  _id: Types.ObjectId;
  cellId: number;
  ownerId: Types.ObjectId | null;
  claimedAt: Date | null;
  version: number;
}

export const Cell = model("Cell", cellSchema);

export function toCellState(cell: Pick<CellDoc, "cellId" | "ownerId" | "claimedAt" | "version">): CellState {
  return {
    cellId: cell.cellId,
    ownerId: cell.ownerId ? cell.ownerId.toString() : null,
    claimedAt: cell.claimedAt ? cell.claimedAt.toISOString() : null,
    version: cell.version,
  };
}
