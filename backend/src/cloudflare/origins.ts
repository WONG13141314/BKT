/** Exact browser origins permitted by the combined frontend and Worker. */
export function getConfiguredOrigins(value = ''): string[] {
  return [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))];
}

export function allowedOrigin(request: Request, env: { CORS_ORIGIN?: string }): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === new URL(request.url).origin) return true;
  return getConfiguredOrigins(env.CORS_ORIGIN).includes(origin);
}
