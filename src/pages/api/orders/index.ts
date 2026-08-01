import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { listActiveOrders, listOrdersPendingPayment, createDeliveryOrder, createOrderForTable } from '@/lib/db/orders';
import type { OrderStatus, OrderType, UserRole } from '@/lib/db/types';
import { validateDeliveryInput } from '@/lib/orders/display';

const ORDER_ROLES: UserRole[] = ['admin', 'cajero', 'mesero'];

const VALID_STATUSES: OrderStatus[] = ['pendiente', 'cocina', 'listo', 'entregado'];
const VALID_ORDER_TYPES: OrderType[] = ['mesa', 'delivery'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, ORDER_ROLES);
  if (auth instanceof Response) return auth;

  const statusParam = context.url.searchParams.get('status');
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

  const typeParam = context.url.searchParams.get('type');
  const orderType =
    typeParam && VALID_ORDER_TYPES.includes(typeParam as OrderType)
      ? (typeParam as OrderType)
      : undefined;

  if (context.url.searchParams.get('pending_payment') === '1') {
    const orders = await listOrdersPendingPayment();
    return Response.json({ orders });
  }

  const orders = await listActiveOrders(status, orderType);
  return Response.json({ orders });
};

export const POST: APIRoute = async (context) => {
  const session = requireRoles(context, ORDER_ROLES);
  if (session instanceof Response) return session;

  let body: {
    table_id?: string;
    order_type?: string;
    customer_name?: string;
    customer_phone?: string;
    delivery_address?: string;
    delivery_notes?: string;
    delivery_payment_timing?: string;
  };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const orderType = body.order_type?.trim() === 'delivery' ? 'delivery' : 'mesa';

  if (orderType === 'delivery') {
    const validationError = validateDeliveryInput({
      customer_name: body.customer_name ?? '',
      customer_phone: body.customer_phone ?? '',
      delivery_address: body.delivery_address ?? '',
      delivery_notes: body.delivery_notes,
    });

    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    try {
      const timing =
        body.delivery_payment_timing?.trim() === 'prepaid' ? 'prepaid' : 'on_delivery';

      const order = await createDeliveryOrder(session.userId, {
        customer_name: body.customer_name!.trim(),
        customer_phone: body.customer_phone!.trim(),
        delivery_address: body.delivery_address!.trim(),
        delivery_notes: body.delivery_notes?.trim(),
        delivery_payment_timing: timing,
      });
      return Response.json({ order }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el domicilio';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  const tableId = body.table_id?.trim();

  if (!tableId) {
    return Response.json({ error: 'table_id es requerido' }, { status: 400 });
  }

  try {
    const order = await createOrderForTable(tableId, session.userId);
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la comanda';
    return Response.json({ error: message }, { status: 400 });
  }
};
