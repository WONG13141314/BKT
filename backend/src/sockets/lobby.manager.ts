export interface LobbyPlayer {
  id: string;
  name: string;
  isReady: boolean;
  avatar: string;
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, LobbyPlayer>;
  maxPlayers: number;
  status: 'waiting' | 'playing';
}

const AVATARS = ['😎', '🤖', '🤠', '👻', '👽', '👾', '🦊', '🐱'];

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  // Maps a userId to the room code they are in
  private userRoomMap: Map<string, string> = new Map();

  /** Generate a random 6-character alphanumeric room code */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.rooms.has(code)) return this.generateCode();
    return code;
  }

  /** Create a new room. The creator becomes the host. */
  public createRoom(userId: string, userName: string): Room {
    // If user is already in a room, remove them first
    this.removePlayer(userId);

    const code = this.generateCode();
    const avatar = AVATARS[0];
    const player: LobbyPlayer = { id: userId, name: userName, isReady: true, avatar };

    const room: Room = {
      code,
      hostId: userId,
      players: new Map([[userId, player]]),
      maxPlayers: 4,
      status: 'waiting',
    };

    this.rooms.set(code, room);
    this.userRoomMap.set(userId, code);
    return room;
  }

  /** Join an existing room by code. Returns the room or null if invalid/full. */
  public joinRoom(code: string, userId: string, userName: string): { room: Room | null; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { room: null, error: 'Room not found. Check the code and try again.' };
    if (room.status === 'playing') return { room: null, error: 'Game already in progress.' };
    if (room.players.size >= room.maxPlayers && !room.players.has(userId)) {
      return { room: null, error: 'Room is full (max 4 players).' };
    }

    // If user is already in another room, remove them
    this.removePlayer(userId);

    const avatar = AVATARS[room.players.size % AVATARS.length];
    const player: LobbyPlayer = { id: userId, name: userName, isReady: false, avatar };
    room.players.set(userId, player);
    this.userRoomMap.set(userId, code.toUpperCase());
    return { room };
  }

  /** Remove a player from whatever room they are in. Returns the room code if they were in one. */
  public removePlayer(userId: string): string | null {
    const code = this.userRoomMap.get(userId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.userRoomMap.delete(userId);
      return null;
    }

    room.players.delete(userId);
    this.userRoomMap.delete(userId);

    // If room is now empty, delete it
    if (room.players.size === 0) {
      this.rooms.delete(code);
      return code;
    }

    // If the host left, reassign to next player
    if (room.hostId === userId) {
      room.hostId = room.players.keys().next().value ?? '';
    }

    return code;
  }

  public toggleReady(userId: string): string | null {
    const code = this.userRoomMap.get(userId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(userId);
    if (player) {
      player.isReady = !player.isReady;
    }
    return code;
  }

  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public getRoomForUser(userId: string): Room | null {
    const code = this.userRoomMap.get(userId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  public canStartGame(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    const players = Array.from(room.players.values());
    if (players.length < 2 || players.length > room.maxPlayers) return false;
    return players.every((p) => p.isReady);
  }

  public setRoomStatus(code: string, status: 'waiting' | 'playing') {
    const room = this.rooms.get(code);
    if (room) room.status = status;
  }

  /** Serialize room state for sending over the wire */
  public serializeRoom(room: Room) {
    return {
      code: room.code,
      hostId: room.hostId,
      players: Array.from(room.players.values()),
      maxPlayers: room.maxPlayers,
      status: room.status,
    };
  }
}

export const roomManager = new RoomManager();
