import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { MongoMemoryServer } from "mongodb-memory-server-core";
import type { ClientToServerEvents, PublicUser, ServerToClientEvents } from "@gridrush/shared";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { createGridServer, type GridServer } from "../src/server.js";
import { ensureBoard } from "../src/services/boardService.js";

export type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export interface TestContext {
  server: GridServer;
  baseUrl: string;
  /** Connection string of this test's database. */
  uri: string;
  api: ReturnType<typeof request>;
  stop(): Promise<void>;
}

/**
 * Start the real app (Express + Socket.IO) on a random port against a fresh database.
 *
 * Database: if MONGO_TEST_URL is set (e.g. mongodb://127.0.0.1:27017) a uniquely
 * named database on that server is used and dropped afterwards; otherwise an
 * in-memory MongoDB is started with mongodb-memory-server.
 */
export async function startTestServer(): Promise<TestContext> {
  let memory: MongoMemoryServer | undefined;
  const dbName = `gridrush_test_${randomBytes(4).toString("hex")}`;

  let uri: string;
  if (process.env.MONGO_TEST_URL) {
    uri = `${process.env.MONGO_TEST_URL.replace(/\/$/, "")}/${dbName}`;
  } else {
    const { MongoMemoryServer } = await import("mongodb-memory-server-core");
    memory = await MongoMemoryServer.create();
    uri = memory.getUri(dbName);
  }

  mongoose.set("autoIndex", false);
  await mongoose.connect(uri);
  await ensureBoard();

  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    RATE_LIMIT_DISABLED: true,
    CLIENT_ORIGIN: "http://localhost:5173",
    MONGODB_URI: uri,
  });
  const server = createGridServer(config, createLogger("silent", false));
  const port = await server.listen(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    baseUrl,
    uri,
    api: request(baseUrl),
    async stop() {
      await server.close();
      await mongoose.connection.dropDatabase().catch(() => undefined);
      await mongoose.disconnect();
      await memory?.stop();
    },
  };
}

export async function createUser(ctx: TestContext, displayName: string): Promise<{ user: PublicUser; token: string }> {
  const res = await ctx.api.post("/api/session").send({ displayName }).expect(201);
  return res.body;
}

export function claim(ctx: TestContext, token: string, cellId: number | string) {
  return ctx.api.post(`/api/cells/${cellId}/claim`).set("Authorization", `Bearer ${token}`);
}

export function connectClient(ctx: TestContext, token: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket: TestClient = ioClient(ctx.baseUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 5_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Resolve with the next event payload that matches `predicate`. */
export function waitForEvent<E extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: E,
  predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 5_000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`timed out waiting for ${String(event)}`));
    }, timeoutMs);
    socket.on(event, handler as never);
  });
}

/** Collect every payload of `event` until `stop()` is called. */
export function collectEvents<E extends keyof ServerToClientEvents>(socket: TestClient, event: E) {
  const items: Array<Parameters<ServerToClientEvents[E]>[0]> = [];
  const handler = (p: Parameters<ServerToClientEvents[E]>[0]) => items.push(p);
  socket.on(event, handler as never);
  return { items, stop: () => socket.off(event, handler as never) };
}

/** Subscribe to the board and return the snapshot. */
export async function subscribe(socket: TestClient) {
  const snapshot = waitForEvent(socket, "board:snapshot");
  socket.emit("board:subscribe");
  return snapshot;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
