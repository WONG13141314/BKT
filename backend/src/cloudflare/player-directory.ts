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
  constructor(private readonly ctx: DurableObjectState, _env: unknown) {}

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
      const code = input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>).code : undefined;
      if (!validRoomCode(code)) {
        return json({ message: 'Invalid room code' }, 400);
      }

      const claim = await this.ctx.storage.transaction(async (storage) => {
        const previous = await storage.get<Membership>('membership');
        const version = (previous?.version ?? 0) + 1;
        if (!Number.isSafeInteger(version)) throw new Error('Membership version limit reached');
        await storage.put('membership', { code, version } satisfies Membership);
        return { code, previousCode: previous?.code ?? null, version };
      });
      return json(claim);
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
