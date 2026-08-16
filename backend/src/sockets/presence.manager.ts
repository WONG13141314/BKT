/** Tracks the open Socket.IO connections for each authenticated player. */
export class SocketPresence {
  private readonly socketsByPlayer = new Map<string, Set<string>>();

  connect(playerId: string, socketId: string): void {
    let sockets = this.socketsByPlayer.get(playerId);
    if (!sockets) {
      sockets = new Set<string>();
      this.socketsByPlayer.set(playerId, sockets);
    }
    sockets.add(socketId);
  }

  disconnect(playerId: string, socketId: string): number {
    const sockets = this.socketsByPlayer.get(playerId);
    if (!sockets) return 0;

    sockets.delete(socketId);
    if (sockets.size === 0) this.socketsByPlayer.delete(playerId);
    return sockets.size;
  }

  count(playerId: string): number {
    return this.socketsByPlayer.get(playerId)?.size ?? 0;
  }
}
