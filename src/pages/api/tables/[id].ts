import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import { requireRoles } from '@/lib/auth/require-roles';
import type { UserRole } from '@/lib/db/types';
import {
  countActiveOrdersForTable,
  deleteTable,
  getTableById,
  getTableByNumber,
  isValidTableStatus,
  updateTable,
} from '@/lib/db/tables';

const TABLE_ROLES: UserRole[] = ['admin', 'cajero', 'mesero'];

async function getTargetTable(id: string) {
  const table = await getTableById(id);
  if (!table) {
    return Response.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }
  return table;
}

function validateStatusTransition(
  currentStatus: string,
  nextStatus: string,
  isAdmin: boolean,
): string | null {
  if (!isValidTableStatus(nextStatus)) {
    return 'Estado inválido';
  }

  if (currentStatus === nextStatus) {
    return null;
  }

  if (nextStatus === 'libre' && currentStatus === 'limpieza') {
    return null;
  }

  if (isAdmin) {
    if (nextStatus === 'ocupada' && currentStatus === 'libre') {
      return 'Para ocupar una mesa libre, abre una comanda';
    }
    if (nextStatus === 'limpieza' && currentStatus === 'ocupada') {
      return null;
    }
    if (nextStatus === 'libre' && currentStatus === 'ocupada') {
      return null;
    }
    return 'Transición de estado no permitida';
  }

  return 'Solo puedes marcar mesas en limpieza como libres';
}

export const PATCH: APIRoute = async (context) => {
  const session = requireRoles(context, TABLE_ROLES);
  if (session instanceof Response) return session;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetTable(id);
  if (target instanceof Response) return target;

  let body: { number?: string; capacity?: number; status?: string };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const isAdmin = session.role === 'admin';
  const hasMetadata = body.number !== undefined || body.capacity !== undefined;
  const hasStatus = body.status !== undefined;

  if (hasMetadata && !isAdmin) {
    return Response.json({ error: 'Solo administradores pueden editar mesas' }, { status: 403 });
  }

  if (!hasMetadata && !hasStatus) {
    return Response.json({ error: 'No hay cambios para aplicar' }, { status: 400 });
  }

  const number = body.number?.trim();
  const capacity = body.capacity;
  const status = body.status;

  if (number !== undefined && number.length < 1) {
    return Response.json({ error: 'El número de mesa es requerido' }, { status: 400 });
  }

  if (
    capacity !== undefined &&
    (!Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 50)
  ) {
    return Response.json({ error: 'Capacidad inválida (1–50)' }, { status: 400 });
  }

  if (status !== undefined) {
    const transitionError = validateStatusTransition(target.status, status, isAdmin);
    if (transitionError) {
      return Response.json({ error: transitionError }, { status: 400 });
    }
  }

  if (number && number !== target.number) {
    const existing = await getTableByNumber(number);
    if (existing && existing.id !== id) {
      return Response.json({ error: 'Ya existe una mesa con ese número' }, { status: 409 });
    }
  }

  const table = await updateTable(id, {
    number,
    capacity: capacity !== undefined ? Number(capacity) : undefined,
    status: status as 'libre' | 'ocupada' | 'limpieza' | undefined,
  });

  return Response.json({ table });
};

export const DELETE: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetTable(id);
  if (target instanceof Response) return target;

  const activeOrders = await countActiveOrdersForTable(id);
  if (activeOrders > 0) {
    return Response.json(
      { error: 'No se puede eliminar: la mesa tiene comandas activas' },
      { status: 409 },
    );
  }

  await deleteTable(id);
  return Response.json({ ok: true });
};
