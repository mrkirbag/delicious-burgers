import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { addOrderItem, getOrderById } from '@/lib/db/orders';
import type { UserRole } from '@/lib/db/types';

const ORDER_ROLES: UserRole[] = ['admin', 'cajero', 'mesero'];

export const POST: APIRoute = async (context) => {
  const session = requireRoles(context, ORDER_ROLES);
  if (session instanceof Response) return session;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const order = await getOrderById(id);
  if (!order) {
    return Response.json({ error: 'Comanda no encontrada' }, { status: 404 });
  }

  let body: { product_id?: string; quantity?: number; notes?: string; adicional_ids?: string[] };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const productId = body.product_id?.trim();
  const quantity = body.quantity ?? 1;
  const notes = body.notes;
  const adicionalIds = Array.isArray(body.adicional_ids)
    ? body.adicional_ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (!productId) {
    return Response.json({ error: 'product_id es requerido' }, { status: 400 });
  }

  try {
    const item = await addOrderItem(
      id,
      { productId, quantity: Number(quantity), notes, adicionalIds },
      session.userId,
    );
    const updatedOrder = await getOrderById(id);

    return Response.json({ item, order: updatedOrder }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo agregar el ítem';
    return Response.json({ error: message }, { status: 400 });
  }
};
