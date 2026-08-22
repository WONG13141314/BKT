export type RuntimeEnvironment = 'development' | 'test' | 'production';

const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/** Returns the exact browser origins accepted by HTTP and Socket.IO. */
export function getAllowedOrigins(
  configuredOrigins: string,
  runtime: RuntimeEnvironment,
): string[] {
  const configured = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set(runtime === 'production'
    ? configured
    : [...configured, ...DEVELOPMENT_ORIGINS])];
}
