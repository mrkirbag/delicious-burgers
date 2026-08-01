import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import {
  cancelOrder,
  getOrderDetail,
  getOrderById,
  markOrderDelivered,
  markOrderReady,
  sendOrderToKitchen,
} from '@/lib/db/orders';
import { getTableById } from '@/lib/db/tables';
import type { OrderStatus, UserRole } from '@/lib/db/types';
import { isValidStatusTransition } from '@/lib/orders/delivery-flow';

const READ_ROLES: UserRole[] = ['admin', 'cajero', 'mesero', 'cocina'];

const TRANSITION_ROLES: Record<string, UserRole[]> = {
  'pendiente:cocina': ['admin', 'cajero', 'mesero'],
  'pagado:cocina': ['admin', 'cajero', 'mesero'],
  'pendiente:cancelado': ['admin', 'cajero', 'mesero'],
  'cocina:listo': ['admin', 'cocina'],
  'listo:entregado': ['admin', 'cajero', 'mesero'],
  'pagado:entregado': ['admin', 'cajero', 'mesero'],
};

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, READ_ROLES);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const detail = await getOrderDetail(id);
  if (!detail) {
    return Response.json({ error: 'Comanda no encontrada' }, { status: 404 });
  }

  const table = detail.order.table_id ? await getTableById(detail.order.table_id) : null;

  return Response.json({
    order: detail.order,
    items: detail.items,
    payments: detail.payments,
    table: table
      ? { id: table.id, number: table.number, capacity: table.capacity, status: table.status }
      : null,
  });
};

export const PATCH: APIRoute = async (context) => {
  const session = requireRoles(context, READ_ROLES);
  if (session instanceof Response) return session;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const order = await getOrderById(id);
  if (!order) {
    return Response.json({ error: 'Comanda no encontrada' }, { status: 404 });
  }

  let body: { status?: string };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const nextStatus = body.status as OrderStatus | undefined;

  if (!nextStatus) {
    return Response.json({ error: 'status es requerido' }, { status: 400 });
  }

  if (!isValidStatusTransition(order, nextStatus)) {
    return Response.json({ error: 'Transición de estado no permitida' }, { status: 400 });
  }

  const transitionKey = `${order.status}:${nextStatus}`;
  const allowedRoles = TRANSITION_ROLES[transitionKey] ?? [];
  if (!allowedRoles.includes(session.role)) {
    return Response.json({ error: 'No tienes permiso para este cambio de estado' }, { status: 403 });
  }

  try {
    let updated = order;

    if (nextStatus === 'cocina') {
      updated = await sendOrderToKitchen(id);
    } else if (nextStatus === 'listo') {
      updated = await markOrderReady(id);
    } else if (nextStatus === 'entregado') {
      updated = await markOrderDelivered(id);
    } else if (nextStatus === 'cancelado') {
      updated = await cancelOrder(id, session.userId);
    }

    const detail = await getOrderDetail(id);

    return Response.json({
      order: updated,
      items: detail?.items ?? [],
      payments: detail?.payments ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar la comanda';
    return Response.json({ error: message }, { status: 400 });
  }
};
