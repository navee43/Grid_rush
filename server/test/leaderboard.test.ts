import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOTAL_CELLS } from "@gridrush/shared";
import { Cell } from "../src/models/Cell.js";
import { claim, createUser, startTestServer, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startTestServer();
});

afterAll(async () => {
  await ctx.stop();
});

describe("leaderboard", () => {
  it("is empty on a fresh board", async () => {
    const res = await ctx.api.get("/api/leaderboard").expect(200);
    expect(res.body).toEqual({ entries: [], totalClaimed: 0, totalOwners: 0, totalCells: TOTAL_CELLS });
  });

  it("matches the persisted ownership data exactly", async () => {
    const plan: Array<[string, number]> = [
      ["Ana", 5],
      ["Ben", 3],
      ["Cy", 3],
      ["Dee", 1],
    ];
    let next = 0;
    const users = [];
    for (const [name, count] of plan) {
      const u = await createUser(ctx, name);
      users.push(u);
      await Promise.all(Array.from({ length: count }, () => claim(ctx, u.token, next++).expect(201)));
    }
    // A conflicting claim must not change any count.
    await claim(ctx, users[3]!.token, 0).expect(409);

    const res = await ctx.api.get("/api/leaderboard?limit=10").expect(200);

    // Ground truth straight from the cells collection.
    const docs = await Cell.find({ ownerId: { $ne: null } }).lean();
    const truth = new Map<string, number>();
    for (const d of docs) truth.set(d.ownerId!.toString(), (truth.get(d.ownerId!.toString()) ?? 0) + 1);

    expect(res.body.totalClaimed).toBe(docs.length);
    expect(res.body.totalOwners).toBe(truth.size);
    for (const entry of res.body.entries) {
      expect(entry.cells).toBe(truth.get(entry.user.id));
      expect(entry.percent).toBeCloseTo((entry.cells / TOTAL_CELLS) * 100, 2);
    }

    expect(res.body.entries.map((e: { user: { displayName: string } }) => e.user.displayName)).toEqual([
      "Ana",
      "Ben", // ties broken by who joined first
      "Cy",
      "Dee",
    ]);
    expect(res.body.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("supports pagination", async () => {
    const page = await ctx.api.get("/api/leaderboard?limit=2&offset=1").expect(200);
    expect(page.body.entries).toHaveLength(2);
    expect(page.body.entries[0].rank).toBe(2);
    expect(page.body.entries[0].user.displayName).toBe("Ben");
  });

  it("rejects bad query parameters", async () => {
    await ctx.api.get("/api/leaderboard?limit=0").expect(400);
    await ctx.api.get("/api/leaderboard?limit=1000").expect(400);
    await ctx.api.get("/api/leaderboard?offset=-1").expect(400);
    await ctx.api.get("/api/leaderboard?sort=name").expect(400);
  });
});
