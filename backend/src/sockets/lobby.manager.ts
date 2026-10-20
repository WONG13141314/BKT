import { AVATARS } from '../features/auth/auth.validation';

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

export interface RoomManagerSnapshot {
  rooms: Array<Omit<Room, 'players'> & { players: LobbyPlayer[] }>;
  botCounter: number;
}

/**
 * Random turn order for a new match (Fisher-Yates). Lobby order is join order,
 * so the host always went first; in simulated 4-player games the first seat won
 * about 31% of games against 25% for an even share.
 */
export function shuffleTurnOrder<T>(seats: readonly T[], random: () => number = Math.random): T[] {
  const order = [...seats];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Pieces bots take first. Humans bring their own from their profile. */
const BOT_AVATARS = ['duck', 'cat', 'boot', 'wheelbarrow', 'ship', 'dog', 'car', 'tophat'] as const;

function isAvatar(value: unknown): value is (typeof AVATARS)[number] {
  return typeof value === 'string' && (AVATARS as readonly string[]).includes(value);
}

/** Keep the preferred piece when no one else holds it; otherwise the first free one. */
function freeAvatar(room: Room, preferred: readonly string[], exceptPlayerId?: string): string {
  const taken = new Set([...room.players.values()].filter((player) => player.id !== exceptPlayerId).map((player) => player.avatar));
  return preferred.find((avatar) => isAvatar(avatar) && !taken.has(avatar))
    ?? AVATARS.find((avatar) => !taken.has(avatar))
    ?? preferred[0] ?? AVATARS[0];
}
const BOT_NAMES = ['Bot Ali', 'Bot Mei', 'Bot Raju', 'Bot Siti'];
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRoomMap: Map<string, string> = new Map();
  private botCounter = 0;
  private readonly fixedCode?: string;

  constructor(options: { fixedCode?: string } = {}) {
    this.fixedCode = options.fixedCode?.toUpperCase();
  }

  public snapshot(): RoomManagerSnapshot {
    return structuredClone({
      rooms: [...this.rooms.values()].map((room) => this.serializeRoom(room)),
      botCounter: this.botCounter,
    });
  }

  public restore(snapshot: RoomManagerSnapshot): void {
    this.rooms.clear();
    this.playerRoomMap.clear();
    this.botCounter = snapshot.botCounter;
    for (const saved of snapshot.rooms) {
      if (this.fixedCode && saved.code !== this.fixedCode) {
        throw new Error('Room snapshot does not belong to this runtime.');
      }
      const room: Room = { ...saved, players: new Map(saved.players.map((player) => [player.id, player])) };
      this.rooms.set(room.code, room);
      for (const player of room.players.values()) {
        if (!player.isBot) this.playerRoomMap.set(player.id, room.code);
      }
    }
  }

  /** Generate a random 6-character alphanumeric room code */
  private generateCode(): string {
    if (this.fixedCode) return this.fixedCode;
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
    if (this.fixedCode) {
      const existing = this.rooms.get(this.fixedCode);
      if (existing) {
        if (existing.hostId !== playerId) throw new Error('This room already has a host.');
        return existing;
      }
    }
    this.removePlayer(playerId);

    const code = this.generateCode();
    const player: LobbyPlayer = {
      id: playerId, name: playerName, isReady: true, avatar: isAvatar(avatar) ? avatar : AVATARS[0], isBot: false,
    };

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

    const player: LobbyPlayer = {
      id: playerId, name: playerName, isReady: false, avatar: freeAvatar(room, [avatar], playerId), isBot: false,
    };
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

    this.botCounter++;
    const botId = `bot_${this.botCounter}_${Date.now()}`;
    const botName = BOT_NAMES[(this.botCounter - 1) % BOT_NAMES.length];

    const bot: LobbyPlayer = {
      id: botId,
      name: botName,
      isReady: true,       // Bots are always ready
      avatar: freeAvatar(room, BOT_AVATARS),
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

  /** Choose this player's piece for the coming match. Each piece has one owner per room. */
  public setAvatar(playerId: string, avatar: unknown): { room: Room | null; error?: string } {
    const room = this.getRoomForPlayer(playerId);
    const player = room?.players.get(playerId);
    if (!room || !player) return { room: null, error: 'You are not in a room.' };
    if (room.status !== 'waiting') return { room: null, error: 'Game already in progress.' };
    if (!isAvatar(avatar)) return { room: null, error: 'Choose one of the eight tokens.' };
    if ([...room.players.values()].some((other) => other.id !== playerId && other.avatar === avatar)) {
      return { room: null, error: 'Another player already has that token.' };
    }
    player.avatar = avatar;
    return { room };
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
