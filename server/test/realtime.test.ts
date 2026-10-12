import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { CellClaimedPayload } from "@gridrush/shared";
import {
  claim,
  collectEvents,
  connectClient,
  createUser,
  sleep,
  startTestServer,
  subscribe,
  waitForEvent,
  type TestClient,
  type TestContext,
} from "./helpers.js";

let ctx: TestContext;
const open: TestClient[] = [];

async function client(token: string) {
  const s = await connectClient(ctx, token);
  open.push(s);
  return s;
}

beforeAll(async () => {
  ctx = await startTestServer();
});

afterEach(() => {
  while (open.length) open.pop()!.disconnect();
});

afterAll(async () => {
  await ctx.stop();
});

describe("Socket.IO real-time sync", () => {
  it("rejects sockets without a valid session", async () => {
    const err = await new Promise<Error>((resolve) => {
      const s = ioClient(ctx.baseUrl, {
        auth: { token: "nope" },
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
      });
      s.on("connect_error", (e) => {
        s.close();
        resolve(e);
      });
    });
    expect(err.message).toBe("UNAUTHORIZED");
  });

  it("broadcasts a successful claim to every subscribed client", async () => {
    const alex = await createUser(ctx, "Alex");
    const sam = await createUser(ctx, "Sam");
    const a = await client(alex.token);
    const b = await client(sam.token);
    await Promise.all([subscribe(a), subscribe(b)]);

    const seenByA = waitForEvent(a, "cell:claimed", (p) => p.cellId === 42);
    const seenByB = waitForEvent(b, "cell:claimed", (p) => p.cellId === 42);
    await claim(ctx, alex.token, 42).expect(201);

    const [pa, pb] = await Promise.all([seenByA, seenByB]);
    const expected: Partial<CellClaimedPayload> = { cellId: 42, ownerId: alex.user.id, owner: alex.user, version: 1 };
    expect(pa).toMatchObject(expected);
    expect(pb).toMatchObject(expected);
    expect(typeof pb.claimedAt).toBe("string");
  });

  it("does not broadcast failed or repeated claims", async () => {
    const owner = await createUser(ctx, "Owner");
    const loser = await createUser(ctx, "Loser");
    const watcher = await client(loser.token);
    await subscribe(watcher);
    const events = collectEvents(watcher, "cell:claimed");

    await claim(ctx, owner.token, 43).expect(201);
    await claim(ctx, loser.token, 43).expect(409); // conflict
    await claim(ctx, owner.token, 43).expect(200); // idempotent retry
    await sleep(300);
    events.stop();

    expect(events.items.filter((e) => e.cellId === 43)).toHaveLength(1);
  });

  it("broadcasts exactly one event when many users race for the same cell", async () => {
    const racers = await Promise.all(Array.from({ length: 12 }, (_, i) => createUser(ctx, `R${i}`)));
    const watcher = await client(racers[0]!.token);
    await subscribe(watcher);
    const events = collectEvents(watcher, "cell:claimed");

    const results = await Promise.all(racers.map((r) => claim(ctx, r.token, 44)));
    await sleep(300);
    events.stop();

    const winner = results.find((r) => r.status === 201)!;
    const forCell = events.items.filter((e) => e.cellId === 44);
    expect(forCell).toHaveLength(1);
    expect(forCell[0]!.ownerId).toBe(winner.body.owner.id);
  });

  it("gives a newly connected client the current board", async () => {
    const early = await createUser(ctx, "Early");
    await claim(ctx, early.token, 50).expect(201);
    await claim(ctx, early.token, 51).expect(201);

    const late = await createUser(ctx, "Late");
    const s = await client(late.token);
    const snapshot = await subscribe(s);

    expect(snapshot.gridSize).toBe(30);
    expect(snapshot.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cellId: 50, ownerId: early.user.id, version: 1 }),
        expect.objectContaining({ cellId: 51, ownerId: early.user.id, version: 1 }),
      ]),
    );
    expect(snapshot.owners[early.user.id]).toEqual(early.user);
    expect(snapshot.activity[0]).toMatchObject({ cellId: 51, owner: early.user });
    // Only claimed cells are sent.
    expect(snapshot.cells.every((c) => c.ownerId !== null)).toBe(true);
  });

  it("lets a client that was offline recover missed claims on reconnect", async () => {
    const roamer = await createUser(ctx, "Roamer");
    const other = await createUser(ctx, "Other");

    const s = await client(roamer.token);
    await subscribe(s);

    // Drop the connection, then make changes while it is offline.
    s.disconnect();
    await claim(ctx, other.token, 60).expect(201);
    await claim(ctx, other.token, 61).expect(201);

    // Reconnect the same socket object, like the browser client does, and resubscribe.
    const reconnected = new Promise<void>((resolve) => s.once("connect", () => resolve()));
    s.connect();
    await reconnected;
    const snapshot = await subscribe(s);

    const ids = snapshot.cells.filter((c) => c.ownerId === other.user.id).map((c) => c.cellId);
    expect(ids).toEqual(expect.arrayContaining([60, 61]));

    // And it receives live events again after resubscribing.
    const live = waitForEvent(s, "cell:claimed", (p) => p.cellId === 62);
    await claim(ctx, other.token, 62).expect(201);
    expect((await live).ownerId).toBe(other.user.id);
  });

  it("does not deliver duplicate events after several resubscribes", async () => {
    const u = await createUser(ctx, "Resub");
    const s = await client(u.token);
    await subscribe(s);
    await sleep(1_100); // server allows one snapshot request per second per socket
    await subscribe(s);
    const events = collectEvents(s, "cell:claimed");

    await claim(ctx, u.token, 70).expect(201);
    await sleep(300);
    events.stop();
    expect(events.items.filter((e) => e.cellId === 70)).toHaveLength(1);
  });

  it("throttles snapshot spam with a board:error", async () => {
    const u = await createUser(ctx, "Spammy");
    const s = await client(u.token);
    await subscribe(s);
    const err = waitForEvent(s, "board:error");
    s.emit("board:subscribe");
    expect((await err).code).toBe("RATE_LIMITED");
  });

  it("reports online presence, counting each user once", async () => {
    const p1 = await createUser(ctx, "Pres1");
    const p2 = await createUser(ctx, "Pres2");

    const s1 = await client(p1.token);
    await subscribe(s1);
    const twoOnline = waitForEvent(s1, "user:presence", (p) => p.online === 2);
    await client(p2.token);
    await twoOnline;

    // A second tab for the same user doesn't change the count.
    const events = collectEvents(s1, "user:presence");
    await client(p2.token);
    await sleep(200);
    events.stop();
    expect(events.items.every((e) => e.online === 2)).toBe(true);
  });
});
