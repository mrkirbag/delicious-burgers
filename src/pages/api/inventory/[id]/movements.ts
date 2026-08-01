import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  getInventoryItemById,
  listInventoryMovements,
  registerInventoryMovement,
} from '@/lib/db/inventory';
import type { InventoryMovementType } from '@/lib/db/types';

const VALID_TYPES: InventoryMovementType[] = ['entrada', 'salida'];

export const GET: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const item = await getInventoryItemById(id);
  if (!item) {
    return Response.json({ error: 'Ítem no encontrado' }, { status: 404 });
  }

  const movements = await listInventoryMovements(id);
  return Response.json({ movements });
};

export const POST: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const item = await getInventoryItemById(id);
  if (!item) {
    return Response.json({ error: 'Ítem no encontrado' }, { status: 404 });
  }

  let body: { type?: string; quantity?: number; reason?: string };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const type = body.type as InventoryMovementType;
  const quantity = body.quantity !== undefined ? Number(body.quantity) : NaN;

  if (!type || !VALID_TYPES.includes(type)) {
    return Response.json({ error: 'Tipo de movimiento inválido' }, { status: 400 });
  }

  if (Number.isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    return Response.json({ error: 'La cantidad debe ser un entero mayor a 0' }, { status: 400 });
  }

  try {
    const updated = await registerInventoryMovement({
      productId: id,
      type,
      quantity,
      reason: body.reason,
      userId: auth.userId,
    });

    return Response.json({ item: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Stock insuficiente') {
      return Response.json({ error: 'Stock insuficiente para esta salida' }, { status: 409 });
    }
    throw error;
  }
};
