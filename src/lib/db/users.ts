import bcrypt from 'bcryptjs';

import { createId } from '@/lib/utils/id';

import { db } from './client';
import type { SqlArgs } from './sql';
import type { UserRole } from './types';

export type PublicUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
};

const USER_ROLES: UserRole[] = ['admin', 'cajero', 'mesero', 'cocina'];

function mapUser(row: Record<string, unknown>): PublicUser {
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role as UserRole,
    active: Boolean(row.active),
  };
}

export function isValidRole(role: string): role is UserRole {
  return USER_ROLES.includes(role as UserRole);
}

export async function listUsers(): Promise<PublicUser[]> {
  const result = await db.execute({
    sql: 'SELECT id, username, role, active FROM users ORDER BY username ASC',
    args: [],
  });

  return result.rows.map((row) => mapUser(row as Record<string, unknown>));
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const result = await db.execute({
    sql: 'SELECT id, username, role, active FROM users WHERE id = ? LIMIT 1',
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return mapUser(result.rows[0] as Record<string, unknown>);
}

export async function getUserByUsername(username: string): Promise<PublicUser | null> {
  const result = await db.execute({
    sql: 'SELECT id, username, role, active FROM users WHERE username = ? LIMIT 1',
    args: [username],
  });

  if (result.rows.length === 0) return null;
  return mapUser(result.rows[0] as Record<string, unknown>);
}

export async function countActiveAdmins(excludeId?: string): Promise<number> {
  const result = excludeId
    ? await db.execute({
        sql: `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1 AND id != ?`,
        args: [excludeId],
      })
    : await db.execute({
        sql: `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1`,
        args: [],
      });

  return Number(result.rows[0].count);
}

type CreateUserInput = {
  username: string;
  password: string;
  role: UserRole;
};

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = createId();

  await db.execute({
    sql: `
      INSERT INTO users (id, username, password_hash, role, active)
      VALUES (?, ?, ?, ?, 1)
    `,
    args: [id, input.username, passwordHash, input.role],
  });

  const user = await getUserById(id);
  if (!user) throw new Error('No se pudo crear el usuario');
  return user;
}

type UpdateUserInput = {
  username?: string;
  password?: string;
  role?: UserRole;
  active?: boolean;
};

export async function updateUser(id: string, input: UpdateUserInput): Promise<PublicUser | null> {
  const fields: string[] = [];
  const args: SqlArgs = [];

  if (input.username !== undefined) {
    fields.push('username = ?');
    args.push(input.username);
  }

  if (input.role !== undefined) {
    fields.push('role = ?');
    args.push(input.role);
  }

  if (input.active !== undefined) {
    fields.push('active = ?');
    args.push(input.active ? 1 : 0);
  }

  if (input.password) {
    const passwordHash = await bcrypt.hash(input.password, 10);
    fields.push('password_hash = ?');
    args.push(passwordHash);
  }

  if (fields.length === 0) {
    return getUserById(id);
  }

  await db.execute({
    sql: `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    args: [...args, id],
  });

  return getUserById(id);
}

export async function deleteUser(id: string): Promise<boolean> {
  const result = await db.execute({
    sql: 'DELETE FROM users WHERE id = ?',
    args: [id],
  });

  return result.rowsAffected > 0;
}
