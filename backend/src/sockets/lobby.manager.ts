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
  status: 'waiting' | 'starting' | 'playing';
}

/** Fallback token when a bot joins; humans bring their own from their profile. */
const BOT_AVATARS = ['ship', 'boot', 'thimble', 'iron'] as const;
const BOT_NAMES = ['Bot Ali', 'Bot Mei', 'Bot Raju', 'Bot Siti'];
let botCounter = 0;

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRoomMap: Map<string, string> = new Map();

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
  public createRoom(playerId: string, playerName: string, avatar: string): Room {
    this.removePlayer(playerId);

    const code = this.generateCode();
    const player: LobbyPlayer = { id: playerId, name: playerName, isReady: true, avatar, isBot: false };

    const room: Room = {
      code,
      hostId: playerId,
      players: new Map([[playerId, player]]),
      maxPlayers: 4,
      status: 'waiting',
    };

    this.rooms.set(code, room);
    this.playerRoomMap.set(playerId, code);
    return room;
  }

  /** Join an existing room by code */
  public joinRoom(
    code: string,
    playerId: string,
    playerName: string,
    avatar: string
  ): { room: Room | null; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { room: null, error: 'Room not found. Check the code and try again.' };
    if (room.status !== 'waiting') return { room: null, error: 'Game already in progress.' };
    if (room.players.size >= room.maxPlayers && !room.players.has(playerId)) {
      return { room: null, error: 'Room is full (max 4 players).' };
    }

    this.removePlayer(playerId);

    const player: LobbyPlayer = { id: playerId, name: playerName, isReady: false, avatar, isBot: false };
    room.players.set(playerId, player);
    this.playerRoomMap.set(playerId, code.toUpperCase());
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
    if (room.status !== 'waiting') return { room: null, error: 'Game already in progress.' };
    if (room.players.size >= room.maxPlayers) return { room: null, error: 'Room is full (max 4 players).' };

    botCounter++;
    const botId = `bot_${botCounter}_${Date.now()}`;
    const botName = BOT_NAMES[(botCounter - 1) % BOT_NAMES.length];

    const bot: LobbyPlayer = {
      id: botId,
      name: botName,
      isReady: true,       // Bots are always ready
      avatar: BOT_AVATARS[(botCounter - 1) % BOT_AVATARS.length],
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
    if (room.status !== 'waiting') return { room: null, error: 'Game already in progress.' };

    const player = room.players.get(botId);
    if (!player || !player.isBot) return { room: null, error: 'Bot not found.' };

    room.players.delete(botId);
    return { room };
  }

  /** Remove a player from whatever room they are in */
  public removePlayer(playerId: string): string | null {
    const code = this.playerRoomMap.get(playerId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.playerRoomMap.delete(playerId);
      return null;
    }

    room.players.delete(playerId);
    this.playerRoomMap.delete(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return code;
    }

    // If the host left, reassign to next human player
    if (room.hostId === playerId) {
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

  public toggleReady(playerId: string): string | null {
    const code = this.playerRoomMap.get(playerId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (player && !player.isBot) {
      player.isReady = !player.isReady;
    }
    return code;
  }

  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public getRoomForPlayer(playerId: string): Room | null {
    const code = this.playerRoomMap.get(playerId);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  /**
   * Can start if:
   * - At least 1 human + 1 other player (human or bot) = minimum 2 total
   * - All human players are ready (bots are always ready)
   */
  public canStartGame(code: string): boolean {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return false;
    const players = Array.from(room.players.values());
    if (players.length < 2 || players.length > room.maxPlayers) return false;

    const humans = players.filter((p) => !p.isBot);
    if (humans.length < 1) return false; // Need at least 1 human

    return humans.every((p) => p.isReady);
  }

  /** Atomically reserve a ready lobby for a single game creation attempt. */
  public beginStart(code: string, requesterId: string): Room | null {
    const room = this.rooms.get(code.toUpperCase());
    if (
      !room ||
      room.hostId !== requesterId ||
      room.status !== 'waiting' ||
      !this.canStartGame(room.code)
    ) {
      return null;
    }

    room.status = 'starting';
    return room;
  }

  /** Releases a room only when its in-flight game creation did not complete. */
  public cancelStart(code: string): void {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.status === 'starting') room.status = 'waiting';
  }

  public setRoomStatus(code: string, status: Room['status']) {
    const room = this.rooms.get(code.toUpperCase());
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
