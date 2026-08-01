import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { getOrderById, removeOrderItem, updateOrderItem } from '@/lib/db/orders';
import type { UserRole } from '@/lib/db/types';

const ORDER_ROLES: UserRole[] = ['admin', 'cajero', 'mesero'];

export const PATCH: APIRoute = async (context) => {
  const session = requireRoles(context, ORDER_ROLES);
  if (session instanceof Response) return session;

  const { id, itemId } = context.params;
  if (!id || !itemId) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const order = await getOrderById(id);
  if (!order) {
    return Response.json({ error: 'Comanda no encontrada' }, { status: 404 });
  }

  let body: { quantity?: number; notes?: string };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    const item = await updateOrderItem(itemId, body, session.userId);
    if (!item || item.order_id !== id) {
      return Response.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }

    const updatedOrder = await getOrderById(id);
    return Response.json({ item, order: updatedOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar el ítem';
    return Response.json({ error: message }, { status: 400 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const session = requireRoles(context, ORDER_ROLES);
  if (session instanceof Response) return session;

  const { id, itemId } = context.params;
  if (!id || !itemId) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const order = await getOrderById(id);
  if (!order) {
    return Response.json({ error: 'Comanda no encontrada' }, { status: 404 });
  }

  try {
    const removed = await removeOrderItem(itemId, session.userId);
    if (!removed) {
      return Response.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }

    const updatedOrder = await getOrderById(id);
    return Response.json({ ok: true, order: updatedOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo eliminar el ítem';
    return Response.json({ error: message }, { status: 400 });
  }
};
