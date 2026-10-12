import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOTAL_CELLS } from "@gridrush/shared";
import { Cell } from "../src/models/Cell.js";
import { ensureBoard } from "../src/services/boardService.js";
import { claim, createUser, startTestServer, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startTestServer(); // runs ensureBoard once
});

afterAll(async () => {
  await ctx.stop();
});

describe("board initialization", () => {
  it("creates exactly one document per cell", async () => {
    expect(await Cell.countDocuments()).toBe(TOTAL_CELLS);
    const ids = (await Cell.distinct("cellId")) as number[];
    expect(ids).toHaveLength(TOTAL_CELLS);
    expect(Math.min(...ids)).toBe(0);
    expect(Math.max(...ids)).toBe(TOTAL_CELLS - 1);
  });

  it("is idempotent and never overwrites ownership, even when run concurrently", async () => {
    const u = await createUser(ctx, "Keeper");
    await claim(ctx, u.token, 7).expect(201);

    // Force the slow path (bulk upserts) by deleting a few cells, then run several initializers at once.
    await Cell.deleteMany({ cellId: { $in: [800, 801, 802] } });
    await Promise.all([ensureBoard(), ensureBoard(), ensureBoard()]);

    expect(await Cell.countDocuments()).toBe(TOTAL_CELLS);
    const kept = await Cell.findOne({ cellId: 7 }).lean();
    expect(kept?.ownerId?.toString()).toBe(u.user.id);
    expect(kept?.version).toBe(1);
  });

  it("enforces cellId uniqueness at the database level", async () => {
    await expect(Cell.create({ cellId: 5, ownerId: null, claimedAt: null, version: 0 })).rejects.toMatchObject({
      code: 11000,
    });
  });
});
