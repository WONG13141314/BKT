import { handleApiRequest, jsonResponse } from './http';
import { allowedOrigin } from './origins';
import type { WorkerEnv } from './types';
export { GameRoom } from './room';
export { PlayerDirectory } from './player-directory';

/** Gives auth operations the Durable Object CPU budget, including bcrypt cost 10. */
export class ApiService {
  constructor(_ctx: DurableObjectState, private readonly env: WorkerEnv) {}
  fetch(request: Request): Promise<Response> { return handleApiRequest(request, this.env); }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const normalized = url.pathname.replace(/\/+$/, '') || '/';
    const dynamic = normalized === '/ws' || normalized === '/api' || normalized.startsWith('/api/');
    if (!dynamic) return env.ASSETS.fetch(request);
    if (normalized !== url.pathname) {
      url.pathname = normalized;
      request = new Request(url, request);
    }
    if (!allowedOrigin(request, env)) return jsonResponse({ message: 'Origin not allowed' }, 403);
    const cors: Record<string, string> = {
      'access-control-allow-origin': request.headers.get('origin') ?? url.origin,
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'Authorization,Content-Type', vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let response: Response;
      if (url.pathname === '/ws') {
        const room = url.searchParams.get('room');
        if (room && !/^[\w-]{1,100}$/.test(room)) return jsonResponse({ message: 'Invalid room code' }, 400);
        const token = url.searchParams.get('token');
        if (!token || token.length > 4096) return jsonResponse({ message: 'Authentication required' }, 401);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        const session = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const id = env.ROOMS.idFromName(room ? `room:${room}` : `session:${session}`);
        return env.ROOMS.get(id).fetch(request);
      }
      const gameRoute = url.pathname.match(/^\/api\/games(?:\/([^/]+)(?:\/scores)?)?$/);
      if (gameRoute) {
        const code = gameRoute[1] ? decodeURIComponent(gameRoute[1]).replace(/^game_/, '') : crypto.randomUUID();
        if (!/^[\w-]{1,100}$/.test(code)) return jsonResponse({ message: 'Invalid game id' }, 400);
        url.searchParams.set('room', code);
        response = await env.ROOMS.get(env.ROOMS.idFromName(`room:${code}`)).fetch(new Request(url, request));
      } else {
        const id = env.API.idFromName(`request:${crypto.randomUUID()}`);
        response = await env.API.get(id).fetch(request);
      }
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(cors)) headers.set(name, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error('[worker] Request failed:', error instanceof Error ? error.name : 'Unknown error');
      return jsonResponse({ message: 'Service temporarily unavailable' }, 503);
    }
  },
};
