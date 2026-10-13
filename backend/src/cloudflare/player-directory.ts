import type { WorkerEnv } from './types';

interface Membership {
  code: string | null;
  version: number;
}

function validRoomCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Internal per-player directory. Room objects perform any later eviction. */
export class PlayerDirectory {
  constructor(private readonly ctx: DurableObjectState, private readonly env: Pick<WorkerEnv, 'ROOMS'>) {}

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/current' && request.method === 'GET') {
      const membership = await this.ctx.storage.get<Membership>('membership');
      return json({ code: membership?.code ?? null, version: membership?.version ?? 0 });
    }

    if (path === '/claim' && request.method === 'POST') {
      let input: unknown;
      try { input = await request.json(); }
      catch { return json({ message: 'Invalid JSON' }, 400); }
      const fields = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown> : {};
      const { code, playerId } = fields;
      if (!validRoomCode(code) || !validRoomCode(playerId)) {
        return json({ message: 'Invalid room code' }, 400);
      }

      try {
        const claim = await this.ctx.storage.transaction(async (storage) => {
          const previous = await storage.get<Membership>('membership');
          if (previous?.code && previous.code !== code) {
            // Publish a new membership only after the preceding room's committed
            // learner evidence reaches Postgres. Competing devices share this barrier.
            const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(`room:${previous.code}`));
            const response = await room.fetch('https://room/internal/synchronize-player', {
              method: 'POST', body: JSON.stringify({ playerId }),
            });
            if (!response.ok || (await response.json() as { synchronized?: boolean }).synchronized !== true) {
              throw new Error('Player progress synchronization failed');
            }
          }
          const version = (previous?.version ?? 0) + 1;
          if (!Number.isSafeInteger(version)) throw new Error('Membership version limit reached');
          await storage.put('membership', { code, version } satisfies Membership);
          return { code, previousCode: previous?.code ?? null, version };
        });
        return json(claim);
      } catch {
        return json({ message: 'Unable to synchronize player progress' }, 503);
      }
    }

    if (path === '/restore' && request.method === 'POST') {
      let input: unknown;
      try { input = await request.json(); }
      catch { return json({ message: 'Invalid JSON' }, 400); }
      const fields = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown> : {};
      const { code, version, previousCode } = fields;
      if (!validRoomCode(code) || typeof version !== 'number'
        || !Number.isSafeInteger(version) || version < 1
        || !(previousCode === null || validRoomCode(previousCode))) {
        return json({ message: 'Invalid membership restoration' }, 400);
      }

      const restored = await this.ctx.storage.transaction(async (storage) => {
        const current = await storage.get<Membership>('membership');
        // Compensate only the exact claim whose room commit failed. A later
        // device/room claim wins, including a claim back to the same room code.
        if (!current || current.code !== code || current.version !== version) {
          return { restored: false, code: current?.code ?? null, version: current?.version ?? 0 };
        }
        const nextVersion = current.version + 1;
        if (!Number.isSafeInteger(nextVersion)) throw new Error('Membership version limit reached');
        await storage.put('membership', { code: previousCode, version: nextVersion } satisfies Membership);
        return { restored: true, code: previousCode, version: nextVersion };
      });
      return json(restored);
    }

    return json({ message: 'Not found' }, 404);
  }
}
