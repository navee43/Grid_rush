/**
 * Who is online right now. In-memory, because presence is ephemeral and this
 * app runs as a single server process. A user with three tabs open counts once.
 *
 * Scaling note: with several server instances this would move to a shared
 * store (e.g. Redis) alongside the Socket.IO Redis adapter.
 */
export class PresenceTracker {
  private readonly socketsByUser = new Map<string, Set<string>>();

  /** Returns true if this is the user's first open connection. */
  add(userId: string, socketId: string): boolean {
    let sockets = this.socketsByUser.get(userId);
    const isNew = !sockets;
    if (!sockets) {
      sockets = new Set();
      this.socketsByUser.set(userId, sockets);
    }
    sockets.add(socketId);
    return isNew;
  }

  /** Returns true if the user has no connections left. */
  remove(userId: string, socketId: string): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
      return true;
    }
    return false;
  }

  get onlineCount(): number {
    return this.socketsByUser.size;
  }
}
