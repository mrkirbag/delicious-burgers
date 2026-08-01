import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  createUser,
  getUserByUsername,
  isValidRole,
  listUsers,
} from '@/lib/db/users';

const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;

export const GET: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const users = await listUsers();
  return Response.json({ users });
};

export const POST: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  let body: { username?: string; password?: string; role?: string };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  const role = body.role;

  if (!username || username.length < MIN_USERNAME_LENGTH) {
    return Response.json(
      { error: `El usuario debe tener al menos ${MIN_USERNAME_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return Response.json(
      { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  if (!role || !isValidRole(role)) {
    return Response.json({ error: 'Rol inválido' }, { status: 400 });
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    return Response.json({ error: 'Ese nombre de usuario ya existe' }, { status: 409 });
  }

  const user = await createUser({ username, password, role });
  return Response.json({ user }, { status: 201 });
};
