import { JWT_SECRET, TURSO_AUTH_TOKEN, TURSO_URL } from 'astro:env/server';

function pickEnv(
  name: 'TURSO_URL' | 'TURSO_AUTH_TOKEN' | 'JWT_SECRET',
  fallback: string,
): string {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  return fallback;
}

export const env = {
  get tursoUrl() {
    return pickEnv('TURSO_URL', TURSO_URL);
  },
  get tursoAuthToken() {
    return pickEnv('TURSO_AUTH_TOKEN', TURSO_AUTH_TOKEN);
  },
  get jwtSecret() {
    return pickEnv('JWT_SECRET', JWT_SECRET);
  },
} as const;
