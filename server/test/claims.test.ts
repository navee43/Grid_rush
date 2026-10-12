import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { Cell } from "../src/models/Cell.js";
import { claimCell, getSnapshot } from "../src/services/boardService.js";
import { AppError } from "../src/errors.js";
import { claim, createUser, startTestServer, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startTestServer();
});

afterAll(async () => {
  await ctx.stop();
});

describe("claiming cells", () => {
  it("lets a user claim an unclaimed cell", async () => {
    const alex = await createUser(ctx, "Alex");
    const res = await claim(ctx, alex.token, 10).expect(201);

    expect(res.body.alreadyOwned).toBe(false);
    expect(res.body.owner).toEqual(alex.user);
    expect(res.body.cell).toMatchObject({ cellId: 10, ownerId: alex.user.id, version: 1 });
    expect(typeof res.body.cell.claimedAt).toBe("string");
  });

  it("persists the claim in the database", async () => {
    const sam = await createUser(ctx, "Sam");
    await claim(ctx, sam.token, 11).expect(201);

    const doc = await Cell.findOne({ cellId: 11 }).lean();
    expect(doc?.ownerId?.toString()).toBe(sam.user.id);
    expect(doc?.claimedAt).toBeInstanceOf(Date);
    expect(doc?.version).toBe(1);
  });

  it("keeps ownership across a database reconnect (simulated restart)", async () => {
    const kim = await createUser(ctx, "Kim");
    await claim(ctx, kim.token, 12).expect(201);

    await mongoose.disconnect();
    await mongoose.connect(ctx.uri);

    const board = await ctx.api.get("/api/board").expect(200);
    expect(board.body.cells).toContainEqual(expect.objectContaining({ cellId: 12, ownerId: kim.user.id }));
  });

  it("rejects claiming a cell someone else owns, with the real owner in the response", async () => {
    const first = await createUser(ctx, "First");
    const second = await createUser(ctx, "Second");
    await claim(ctx, first.token, 20).expect(201);

    const res = await claim(ctx, second.token, 20).expect(409);
    expect(res.body.error.code).toBe("CELL_TAKEN");
    expect(res.body.error.message).toContain("First");
    expect(res.body.error.details.owner).toEqual(first.user);
    expect(res.body.error.details.cell).toMatchObject({ cellId: 20, ownerId: first.user.id, version: 1 });

    const doc = await Cell.findOne({ cellId: 20 }).lean();
    expect(doc?.ownerId?.toString()).toBe(first.user.id);
    expect(doc?.version).toBe(1);
  });

  it("treats a repeat claim by the same owner as an idempotent success", async () => {
    const dup = await createUser(ctx, "Repeat");
    await claim(ctx, dup.token, 21).expect(201);
    const res = await claim(ctx, dup.token, 21).expect(200);
    expect(res.body.alreadyOwned).toBe(true);

    const doc = await Cell.findOne({ cellId: 21 }).lean();
    expect(doc?.version).toBe(1); // no second write happened
  });
});

describe("concurrency", () => {
  it("over HTTP: many users racing for one cell produce exactly one owner", async () => {
    const racers = await Promise.all(Array.from({ length: 25 }, (_, i) => createUser(ctx, `Racer ${i}`)));
    const cellId = 100;

    const responses = await Promise.all(racers.map((r) => claim(ctx, r.token, cellId)));
    const wins = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(wins).toHaveLength(1);
    expect(conflicts).toHaveLength(racers.length - 1);
    const winnerId = wins[0]!.body.owner.id as string;
    for (const c of conflicts) expect(c.body.error.details.owner.id).toBe(winnerId);

    const doc = await Cell.findOne({ cellId }).lean();
    expect(doc?.ownerId?.toString()).toBe(winnerId);
    expect(doc?.version).toBe(1);
  });

  it("at the service layer: repeated races on fresh cells never yield two owners", async () => {
    const players = await Promise.all(Array.from({ length: 10 }, (_, i) => createUser(ctx, `Svc ${i}`)));

    for (let cellId = 200; cellId < 210; cellId++) {
      const results = await Promise.allSettled(players.map((p) => claimCell(cellId, p.user)));
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(players.length - 1);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(AppError);
        expect((r.reason as AppError).code).toBe("CELL_TAKEN");
      }
      const doc = await Cell.findOne({ cellId }).lean();
      expect(doc?.version).toBe(1);
    }
  });

  it("lets different users claim different cells at the same time", async () => {
    const players = await Promise.all(Array.from({ length: 20 }, (_, i) => createUser(ctx, `Para ${i}`)));
    const responses = await Promise.all(players.map((p, i) => claim(ctx, p.token, 300 + i)));

    expect(responses.map((r) => r.status)).toEqual(players.map(() => 201));
    const docs = await Cell.find({ cellId: { $gte: 300, $lt: 320 } }).lean();
    for (const doc of docs) {
      expect(doc.ownerId?.toString()).toBe(players[doc.cellId - 300]!.user.id);
    }
  });

  it("one user firing the same claim many times gets one write and no errors", async () => {
    const spammer = await createUser(ctx, "Spammer");
    const responses = await Promise.all(Array.from({ length: 10 }, () => claim(ctx, spammer.token, 400)));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200 && r.body.alreadyOwned)).toHaveLength(9);
    const doc = await Cell.findOne({ cellId: 400 }).lean();
    expect(doc?.version).toBe(1);
  });
});

describe("validation and authorization", () => {
  it("rejects invalid cell ids", async () => {
    const v = await createUser(ctx, "Validator");
    for (const bad of ["abc", "-1", "900", "1.5", "99999", "1e2", "%20"]) {
      const res = await claim(ctx, v.token, bad);
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    const snapshot = await getSnapshot();
    expect(snapshot.cells.every((c) => c.ownerId !== v.user.id)).toBe(true);
  });

  it("rejects a claim with an unexpected body", async () => {
    const v = await createUser(ctx, "Bodied");
    const res = await claim(ctx, v.token, 500).send({ ownerId: "someone-else" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects claims without a valid session", async () => {
    await ctx.api.post("/api/cells/501/claim").expect(401);
    await ctx.api.post("/api/cells/501/claim").set("Authorization", "Bearer not-a-real-token").expect(401);
    await ctx.api
      .post("/api/cells/501/claim")
      .set("Authorization", `Bearer ${"x".repeat(43)}`)
      .expect(401);
    const doc = await Cell.findOne({ cellId: 501 }).lean();
    expect(doc?.ownerId ?? null).toBeNull();
  });

  it("rejects malformed session requests", async () => {
    await ctx.api.post("/api/session").send({}).expect(400);
    await ctx.api.post("/api/session").send({ displayName: "x" }).expect(400);
    await ctx.api
      .post("/api/session")
      .send({ displayName: "a".repeat(40) })
      .expect(400);
    await ctx.api.post("/api/session").send({ displayName: "<script>" }).expect(400);
    await ctx.api.post("/api/session").send({ displayName: "Okay", color: "#000" }).expect(400);
    await ctx.api.post("/api/session").set("Content-Type", "application/json").send("{bad json").expect(400);
    await ctx.api
      .post("/api/session")
      .send({ displayName: "Big", pad: "x".repeat(5_000) })
      .expect(413);
  });

  it("returns the current user for a stored token", async () => {
    const me = await createUser(ctx, "Me");
    const res = await ctx.api.get("/api/session").set("Authorization", `Bearer ${me.token}`).expect(200);
    expect(res.body.user).toEqual(me.user);
    expect(res.body.token).toBeUndefined();
  });

  it("returns 404 in the standard envelope for unknown routes", async () => {
    const res = await ctx.api.get("/api/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
