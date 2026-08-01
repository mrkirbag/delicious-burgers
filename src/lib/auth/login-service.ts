import bcrypt from 'bcryptjs';

import { db } from '@/lib/db/client';
import type { UserRole } from '@/lib/db/types';

export type AuthenticatedUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type LoginFailure = {
  ok: false;
  status: number;
  error: string;
};

export type LoginSuccess = {
  ok: true;
  user: AuthenticatedUser;
};

export type LoginResult = LoginFailure | LoginSuccess;

export async function authenticateUser(
  username: string,
  password: string,
): Promise<LoginResult> {
  const result = await db.execute({
    sql: `
      SELECT id, username, password_hash, role, active
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
    args: [username],
  });

  if (result.rows.length === 0) {
    return { ok: false, status: 401, error: 'Credenciales incorrectas' };
  }

  const user = result.rows[0];
  const active = Boolean(user.active);

  if (!active) {
    return { ok: false, status: 403, error: 'Usuario desactivado' };
  }

  const passwordHash = String(user.password_hash);
  const validPassword = await bcrypt.compare(password, passwordHash);

  if (!validPassword) {
    return { ok: false, status: 401, error: 'Credenciales incorrectas' };
  }

  return {
    ok: true,
    user: {
      id: String(user.id),
      username: String(user.username),
      role: user.role as UserRole,
    },
  };
}
