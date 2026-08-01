import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import { requireRoles } from '@/lib/auth/require-roles';
import type { UserRole } from '@/lib/db/types';
import {
  createTable,
  getTableByNumber,
  listTables,
} from '@/lib/db/tables';

const TABLE_ROLES: UserRole[] = ['admin', 'cajero', 'mesero'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, TABLE_ROLES);
  if (auth instanceof Response) return auth;

  const tables = await listTables();
  return Response.json({ tables });
};

export const POST: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  let body: { number?: string; capacity?: number };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const number = body.number?.trim();
  const capacity = body.capacity;

  if (!number || number.length < 1) {
    return Response.json({ error: 'El número de mesa es requerido' }, { status: 400 });
  }

  if (
    capacity === undefined ||
    !Number.isInteger(Number(capacity)) ||
    Number(capacity) < 1 ||
    Number(capacity) > 50
  ) {
    return Response.json({ error: 'Capacidad inválida (1–50)' }, { status: 400 });
  }

  const existing = await getTableByNumber(number);
  if (existing) {
    return Response.json({ error: 'Ya existe una mesa con ese número' }, { status: 409 });
  }

  const table = await createTable({ number, capacity: Number(capacity) });
  return Response.json({ table }, { status: 201 });
};
