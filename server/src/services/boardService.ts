import { Types } from "mongoose";
import {
  ACTIVITY_LIMIT,
  GRID_SIZE,
  TOTAL_CELLS,
  type ActivityItem,
  type BoardSnapshot,
  type CellState,
  type CellTakenDetails,
  type LeaderboardResponse,
  type PublicUser,
} from "@gridrush/shared";
import { Cell, toCellState, type CellDoc } from "../models/Cell.js";
import { User, toPublicUser } from "../models/User.js";
import { AppError } from "../errors.js";

/**
 * Create the cell documents if they don't exist yet.
 *
 * Idempotent and safe to run from several processes at once: every cell is an
 * upsert with $setOnInsert, so existing ownership is never touched, and the
 * unique index on cellId means a race can't produce duplicates (a losing
 * upsert fails with a duplicate-key error, which we ignore).
 */
export async function ensureBoard(): Promise<{ created: number }> {
  await Cell.createIndexes();
  await User.createIndexes();

  const existing = await Cell.countDocuments();
  if (existing >= TOTAL_CELLS) return { created: 0 };

  // Only touch the cells that are missing (e.g. after an interrupted first start).
  const present = new Set((await Cell.distinct("cellId")) as number[]);
  const missing = Array.from({ length: TOTAL_CELLS }, (_, i) => i).filter((i) => !present.has(i));
  if (missing.length === 0) return { created: 0 };

  const ops = missing.map((cellId) => ({
    updateOne: {
      filter: { cellId },
      update: { $setOnInsert: { cellId, ownerId: null, claimedAt: null, version: 0 } },
      upsert: true,
    },
  }));

  try {
    const result = await Cell.bulkWrite(ops, { ordered: false });
    return { created: result.upsertedCount };
  } catch (err) {
    if (isDuplicateKeyError(err)) return { created: 0 };
    throw err;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: number; writeErrors?: Array<{ code?: number; err?: { code?: number } }> };
  if (e?.code === 11000) return true;
  return Array.isArray(e?.writeErrors) && e.writeErrors.every((w) => (w.code ?? w.err?.code) === 11000);
}

export type ClaimResult =
  | { kind: "claimed"; cell: CellState; owner: PublicUser }
  | { kind: "alreadyOwned"; cell: CellState; owner: PublicUser };

/**
 * Claim a cell for a user.
 *
 * The whole decision happens in ONE conditional, atomic database operation:
 * "set the owner of cell N to U, but only if the cell has no owner".
 * MongoDB applies single-document updates atomically, so when two requests
 * race for the same cell exactly one of them matches `ownerId: null`; the other
 * matches nothing and gets a 409. There is no read-then-write window.
 */
export async function claimCell(cellId: number, user: PublicUser): Promise<ClaimResult> {
  const ownerObjectId = new Types.ObjectId(user.id);

  const claimed = await Cell.findOneAndUpdate(
    { cellId, ownerId: null },
    { $set: { ownerId: ownerObjectId, claimedAt: new Date() }, $inc: { version: 1 } },
    { new: true },
  ).lean<CellDoc>();

  if (claimed) return { kind: "claimed", cell: toCellState(claimed), owner: user };

  // The conditional update matched nothing: either the cell is taken or it doesn't exist.
  // This read only explains the outcome to the caller; it never decides ownership.
  const current = await Cell.findOne({ cellId }, { cellId: 1, ownerId: 1, claimedAt: 1, version: 1 }).lean<CellDoc>();
  if (!current) throw AppError.notFound(`Cell ${cellId} does not exist`);

  if (current.ownerId && current.ownerId.equals(ownerObjectId)) {
    // Same user retried (double click, network retry). Treat as success, but don't re-broadcast.
    return { kind: "alreadyOwned", cell: toCellState(current), owner: user };
  }

  const ownerDoc = current.ownerId ? await User.findById(current.ownerId, { displayName: 1, color: 1 }).lean() : null;
  const details: CellTakenDetails = { cell: toCellState(current), owner: ownerDoc ? toPublicUser(ownerDoc) : null };
  const who = details.owner?.displayName ?? "Someone";
  throw new AppError(409, "CELL_TAKEN", `${who} claimed this cell first.`, details);
}

async function loadUsers(ids: Iterable<string>): Promise<Map<string, PublicUser>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await User.find({ _id: { $in: unique } }, { displayName: 1, color: 1 }).lean();
  return new Map(users.map((u) => [u._id.toString(), toPublicUser(u)]));
}

/** Everything a client needs to render the board from scratch. */
export async function getSnapshot(): Promise<BoardSnapshot> {
  const claimed = await Cell.find(
    { ownerId: { $ne: null } },
    { _id: 0, cellId: 1, ownerId: 1, claimedAt: 1, version: 1 },
  ).lean<CellDoc[]>();

  const cells = claimed.map(toCellState);
  const owners = await loadUsers(cells.map((c) => c.ownerId!).filter(Boolean));

  const activity: ActivityItem[] = cells
    .filter((c) => c.claimedAt && c.ownerId && owners.has(c.ownerId))
    .sort((a, b) => (b.claimedAt! > a.claimedAt! ? 1 : b.claimedAt! < a.claimedAt! ? -1 : b.version - a.version))
    .slice(0, ACTIVITY_LIMIT)
    .map((c) => ({ cellId: c.cellId, owner: owners.get(c.ownerId!)!, claimedAt: c.claimedAt!, version: c.version }));

  return {
    gridSize: GRID_SIZE,
    cells,
    owners: Object.fromEntries(owners),
    activity,
    serverTime: new Date().toISOString(),
  };
}

/**
 * Owners ranked by how many cells they hold. Grouping, sorting and paging all
 * happen inside MongoDB, so the response size doesn't grow with the board.
 * Ties go to the player who joined earlier (ObjectIds sort by creation time).
 */
export async function getLeaderboard(limit: number, offset: number): Promise<LeaderboardResponse> {
  const claimedFilter = { ownerId: { $ne: null } };
  const [groups, totalClaimed, ownerIds] = await Promise.all([
    Cell.aggregate<{ _id: Types.ObjectId; cells: number }>([
      { $match: claimedFilter },
      { $group: { _id: "$ownerId", cells: { $sum: 1 } } },
      { $sort: { cells: -1, _id: 1 } },
      { $skip: offset },
      { $limit: limit },
    ]),
    Cell.countDocuments(claimedFilter),
    Cell.distinct("ownerId", claimedFilter),
  ]);

  const users = await loadUsers(groups.map((g) => g._id.toString()));
  const entries = groups
    .map((g, i) => {
      const user = users.get(g._id.toString());
      if (!user) return null;
      return {
        rank: offset + i + 1,
        user,
        cells: g.cells,
        percent: Math.round((g.cells / TOTAL_CELLS) * 10_000) / 100,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    entries,
    totalClaimed,
    totalOwners: ownerIds.length,
    totalCells: TOTAL_CELLS,
  };
}

/** Wipe all ownership. Used by the reset script and tests; not exposed over HTTP. */
export async function resetBoard(): Promise<void> {
  await Cell.updateMany({}, { $set: { ownerId: null, claimedAt: null }, $inc: { version: 1 } });
}
