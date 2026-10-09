import { z } from 'zod';
import {
  AVATARS, claimSchema, displayNameSchema, guestSchema, signInSchema,
} from '../features/auth/auth.validation';
import {
  ApiError, authenticateToken, createAuthService, readBearerToken, type AuthDatabase,
} from './auth';
import { CloudflareDatabase } from './database';
import type { WorkerEnv } from './types';

const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(), avatar: z.enum(AVATARS).optional(),
});

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError('Invalid JSON body', 400);
  }
}

/** Auth API only; game HTTP requests are routed to the owning RoomDO by the Worker. */
export async function handleApiRequest(
  request: Request, env: WorkerEnv, injectedDatabase?: AuthDatabase,
): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const method = request.method;
  if (path === '/api/health' && method === 'GET') {
    return jsonResponse({ status: 'ok', environment: 'production' });
  }

  try {
    const database = injectedDatabase ?? new CloudflareDatabase(env.DATABASE_URL);
    const auth = createAuthService(env, database);
    if (path === '/api/auth/guest' && method === 'POST') {
      return jsonResponse(await auth.createGuest(guestSchema.parse(await readJson(request))), 201);
    }
    if (path === '/api/auth/signin' && method === 'POST') {
      return jsonResponse(await auth.signIn(signInSchema.parse(await readJson(request))));
    }
    const knownProtectedRoute =
      (path === '/api/auth/refresh' && method === 'POST') ||
      (path === '/api/auth/claim' && method === 'POST') ||
      (path === '/api/auth/me' && (method === 'GET' || method === 'PATCH'));
    if (!knownProtectedRoute) return jsonResponse({ message: 'Not found' }, 404);
    const player = await authenticateToken(readBearerToken(request.headers.get('authorization')), env, database);
    if (path === '/api/auth/refresh') return jsonResponse(await auth.refresh(player.id));
    if (path === '/api/auth/claim') {
      return jsonResponse({ player: await auth.claim(player.id, claimSchema.parse(await readJson(request))) });
    }
    if (method === 'GET') return jsonResponse({ player });
    return jsonResponse({
      player: await auth.updateProfile(player.id, updateProfileSchema.parse(await readJson(request))),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ message: error.issues[0]?.message ?? 'Validation error', errors: error.issues }, 400);
    }
    if (error instanceof ApiError) return jsonResponse({ message: error.message }, error.status);
    // Database errors can contain connection details. Keep them out of browser responses.
    console.error('[api] Request failed:', error instanceof Error ? error.name : 'Unknown error');
    return jsonResponse({ message: 'Internal server error' }, 500);
  }
}
