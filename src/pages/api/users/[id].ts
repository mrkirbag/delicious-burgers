import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  countActiveAdmins,
  deleteUser,
  getUserById,
  getUserByUsername,
  isValidRole,
  updateUser,
} from '@/lib/db/users';

const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;

async function getTargetUser(id: string) {
  const user = await getUserById(id);
  if (!user) {
    return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }
  return user;
}

async function ensureNotLastAdmin(userId: string, nextRole?: string, nextActive?: boolean) {
  const user = await getUserById(userId);
  if (!user) return null;

  const isCurrentlyActiveAdmin = user.role === 'admin' && user.active;
  if (!isCurrentlyActiveAdmin) return null;

  const newRole = nextRole ?? user.role;
  const newActive = nextActive ?? user.active;
  const willStopBeingActiveAdmin = newRole !== 'admin' || !newActive;

  if (!willStopBeingActiveAdmin) return null;

  const otherAdmins = await countActiveAdmins(userId);
  if (otherAdmins === 0) {
    return Response.json(
      { error: 'Debe existir al menos un administrador activo' },
      { status: 409 },
    );
  }

  return null;
}

export const PATCH: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetUser(id);
  if (target instanceof Response) return target;

  let body: {
    username?: string;
    password?: string;
    role?: string;
    active?: boolean;
  };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  const role = body.role;
  const active = body.active;

  if (username !== undefined && username.length < MIN_USERNAME_LENGTH) {
    return Response.json(
      { error: `El usuario debe tener al menos ${MIN_USERNAME_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  if (password !== undefined && password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
    return Response.json(
      { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  if (role !== undefined && !isValidRole(role)) {
    return Response.json({ error: 'Rol inválido' }, { status: 400 });
  }

  if (username && username !== target.username) {
    const existing = await getUserByUsername(username);
    if (existing && existing.id !== id) {
      return Response.json({ error: 'Ese nombre de usuario ya existe' }, { status: 409 });
    }
  }

  if (id === auth.userId && active === false) {
    return Response.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 409 });
  }

  if (id === auth.userId && role && role !== 'admin') {
    return Response.json({ error: 'No puedes cambiar tu propio rol' }, { status: 409 });
  }

  const lastAdminError = await ensureNotLastAdmin(id, role, active);
  if (lastAdminError) return lastAdminError;

  const user = await updateUser(id, {
    username,
    password: password || undefined,
    role,
    active,
  });

  return Response.json({ user });
};

export const DELETE: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetUser(id);
  if (target instanceof Response) return target;

  if (id === auth.userId) {
    return Response.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 409 });
  }

  if (target.role === 'admin' && target.active) {
    const admins = await countActiveAdmins(id);
    if (admins === 0) {
      return Response.json(
        { error: 'Debe existir al menos un administrador activo' },
        { status: 409 },
      );
    }
  }

  await deleteUser(id);
  return Response.json({ ok: true });
};
