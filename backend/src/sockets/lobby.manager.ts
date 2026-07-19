export interface LobbyPlayer {
  id: string;
  name: string;
  isReady: boolean;
  avatar: string;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, LobbyPlayer>;
  maxPlayers: number;
  status: 'waiting' | 'playing';
}

const AVATARS = ['😎', '🤖', '🤠', '👻', '👽', '👾', '🦊', '🐱'];
const BOT_NAMES = ['Bot Ali', 'Bot Mei', 'Bot Raju', 'Bot Siti'];
let botCounter = 0;

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private userRoomMap: Map<string, string> = new Map();

  /** Generate a random 6-character alphanumeric room code */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) return this.generateCode();
    return code;
  }

  /** Create a new room. The creator becomes the host. */
  public createRoom(userId: string, userName: string): Room {
    this.removePlayer(userId);

    const code = this.generateCode();
    const avatar = AVATARS[0];
    const player: LobbyPlayer = { id: userId, name: userName, isReady: true, avatar, isBot: false };

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

  /** Join an existing room by code */
  public joinRoom(code: string, userId: string, userName: string): { room: Room | null; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { room: null, error: 'Room not found. Check the code and try again.' };
    if (room.status === 'playing') return { room: null, error: 'Game already in progress.' };
    if (room.players.size >= room.maxPlayers && !room.players.has(userId)) {
      return { room: null, error: 'Room is full (max 4 players).' };
    }

    this.removePlayer(userId);

    const avatar = AVATARS[room.players.size % AVATARS.length];
    const player: LobbyPlayer = { id: userId, name: userName, isReady: false, avatar, isBot: false };
    room.players.set(userId, player);
    this.userRoomMap.set(userId, code.toUpperCase());
    return { room };
  }

  /** Add a bot to the room (host only) */
  public addBot(
    code: string,
    requesterId: string,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): { room: Room | null; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { room: null, error: 'Room not found.' };
    if (room.hostId !== requesterId) return { room: null, error: 'Only the host can add bots.' };
    if (room.status === 'playing') return { room: null, error: 'Game already in progress.' };
    if (room.players.size >= room.maxPlayers) return { room: null, error: 'Room is full (max 4 players).' };

    botCounter++;
    const botId = `bot_${botCounter}_${Date.now()}`;
    const botName = BOT_NAMES[(botCounter - 1) % BOT_NAMES.length];

    const bot: LobbyPlayer = {
      id: botId,
      name: botName,
      isReady: true,       // Bots are always ready
      avatar: '🤖',
      isBot: true,
      botDifficulty: difficulty,
    };

    room.players.set(botId, bot);
    return { room };
  }

  /** Remove a bot from the room (host only) */
  public removeBot(
    code: string,
    requesterId: string,
    botId: string
  ): { room: Room | null; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { room: null, error: 'Room not found.' };
    if (room.hostId !== requesterId) return { room: null, error: 'Only the host can remove bots.' };
    if (room.status === 'playing') return { room: null, error: 'Game already in progress.' };

    const player = room.players.get(botId);
    if (!player || !player.isBot) return { room: null, error: 'Bot not found.' };

    room.players.delete(botId);
    return { room };
  }

  /** Remove a player from whatever room they are in */
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

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return code;
    }

    // If the host left, reassign to next human player
    if (room.hostId === userId) {
      const nextHuman = Array.from(room.players.values()).find((p) => !p.isBot);
      if (nextHuman) {
        room.hostId = nextHuman.id;
      } else {
        // Only bots left — delete room
        this.rooms.delete(code);
        return code;
      }
    }

    return code;
  }

  public toggleReady(userId: string): string | null {
    const code = this.userRoomMap.get(userId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(userId);
    if (player && !player.isBot) {
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

  /**
   * Can start if:
   * - At least 1 human + 1 other player (human or bot) = minimum 2 total
   * - All human players are ready (bots are always ready)
   */
  public canStartGame(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    const players = Array.from(room.players.values());
    if (players.length < 2 || players.length > room.maxPlayers) return false;

    const humans = players.filter((p) => !p.isBot);
    if (humans.length < 1) return false; // Need at least 1 human

    return humans.every((p) => p.isReady);
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
