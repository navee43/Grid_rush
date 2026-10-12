import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SocketEvents,
  type CellClaimedPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@gridrush/shared";
import { API_URL, api, tokenStore } from "@/lib/api";
import { useBoardStore } from "@/store/boardStore";

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Owns the Socket.IO connection for the signed-in player.
 *
 * Sync protocol:
 *  1. On every (re)connect, ask for a fresh snapshot.
 *  2. While that request is in flight, buffer live `cell:claimed` events.
 *  3. When the snapshot arrives, replace local state, then re-apply buffered
 *     events — each one only lands if its version is newer than the snapshot's.
 *  4. After that, apply events directly (still version-checked).
 * This recovers anything missed while offline and can't double-apply anything.
 * If the socket can't connect at all, the board is refreshed over HTTP instead.
 */
export function useBoardSocket(userId: string | undefined, onUnauthorized: () => void) {
  useEffect(() => {
    if (!userId) return;
    const token = tokenStore.get();
    if (!token) return;

    const store = useBoardStore.getState;
    const socket: BoardSocket = io(API_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
    });

    let awaitingSnapshot = false;
    let buffer: CellClaimedPayload[] = [];
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const toUpdate = (p: CellClaimedPayload) => ({
      cell: { cellId: p.cellId, ownerId: p.ownerId, claimedAt: p.claimedAt, version: p.version },
      owner: p.owner,
    });

    const requestSnapshot = () => {
      awaitingSnapshot = true;
      buffer = [];
      socket.emit(SocketEvents.BoardSubscribe);
    };

    socket.on("connect", () => {
      store().setConnection("connected");
      requestSnapshot();
    });

    socket.on("disconnect", (reason) => {
      // "io server disconnect" means the server closed us on purpose; reconnect manually.
      if (reason === "io server disconnect") socket.connect();
      store().setConnection(navigator.onLine ? "reconnecting" : "offline");
    });

    socket.io.on("reconnect_attempt", () => store().setConnection("reconnecting"));
    socket.io.on("reconnect_failed", () => store().setConnection("offline"));

    socket.on("connect_error", (err) => {
      if (err.message === "UNAUTHORIZED") {
        socket.disconnect();
        onUnauthorized();
        return;
      }
      store().setConnection(navigator.onLine ? "reconnecting" : "offline");
    });

    socket.on(SocketEvents.BoardSnapshot, (snapshot) => {
      store().applySnapshot(snapshot);
      for (const p of buffer) store().applyClaim(toUpdate(p), { animate: true });
      buffer = [];
      awaitingSnapshot = false;
    });

    socket.on(SocketEvents.CellClaimed, (payload) => {
      if (awaitingSnapshot) buffer.push(payload);
      else store().applyClaim(toUpdate(payload), { animate: true });
    });

    socket.on(SocketEvents.UserPresence, ({ online }) => store().setOnline(online));

    socket.on(SocketEvents.BoardError, (err) => {
      // A throttled snapshot request: try once more shortly.
      if (awaitingSnapshot && (err.code === "RATE_LIMITED" || err.code === "INTERNAL_ERROR")) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(requestSnapshot, 1_200);
      }
    });

    // Fallback: if the socket can't connect (blocked network, server waking up),
    // keep the board reasonably fresh over plain HTTP until it does. Safe to
    // replace state here because no live events arrive while disconnected.
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = (delay: number) => {
      pollTimer = setTimeout(async () => {
        if (stopped) return;
        if (!socket.connected) {
          try {
            const snapshot = await api.getBoard();
            if (!stopped && !socket.connected) store().applySnapshot(snapshot);
          } catch {
            /* still unreachable; try again later */
          }
        }
        if (!stopped) poll(10_000);
      }, delay);
    };
    poll(3_000);

    const goOffline = () => store().setConnection("offline");
    const goOnline = () => {
      if (socket.connected) {
        // The socket survived the blip, but events may have been lost on the way: resync.
        store().setConnection("connected");
        requestSnapshot();
      } else {
        store().setConnection("reconnecting");
        socket.connect();
      }
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      clearTimeout(retryTimer);
      stopped = true;
      clearTimeout(pollTimer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, [userId, onUnauthorized]);
}
