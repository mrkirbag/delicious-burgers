import type { AstroCookies } from 'astro';

import { verifyToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';
import type { UserRole } from '@/lib/db/types';

export const SESSION_COOKIE = 'session';

export type Session = {
  userId: string;
  username: string;
  role: UserRole;
};

export async function getSession(cookies: AstroCookies): Promise<Session | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const result = await db.execute({
    sql: 'SELECT active FROM users WHERE id = ? LIMIT 1',
    args: [payload.sub],
  });

  if (result.rows.length === 0) {
    return null;
  }

  if (!Boolean(result.rows[0].active)) {
    return null;
  }

  return {
    userId: payload.sub,
    username: payload.username,
    role: payload.role,
  };
}
