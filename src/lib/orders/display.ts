import type { Order, OrderType } from '@/lib/db/types';

export function formatOrderLabel(
  order: Pick<Order, 'order_type' | 'customer_name'> & {
    table_number?: string | null;
  },
): string {
  if (order.order_type === 'delivery') {
    return order.customer_name?.trim() || 'Domicilio';
  }

  return `Mesa ${order.table_number ?? '—'}`;
}

export function formatOrderShortLabel(
  order: Pick<Order, 'order_type' | 'customer_name'> & {
    table_number?: string | null;
  },
): string {
  if (order.order_type === 'delivery') {
    return 'Domicilio';
  }

  return `Mesa ${order.table_number ?? '—'}`;
}

export function isDeliveryOrder(order: Pick<Order, 'order_type'>): boolean {
  return order.order_type === 'delivery';
}

export type CreateDeliveryOrderInput = {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes?: string;
};

export function validateDeliveryInput(input: CreateDeliveryOrderInput): string | null {
  const name = input.customer_name?.trim();
  const phone = input.customer_phone?.trim();
  const address = input.delivery_address?.trim();

  if (!name || name.length < 2) {
    return 'El nombre del cliente es requerido';
  }

  if (!phone || phone.length < 7) {
    return 'El teléfono del cliente es requerido';
  }

  if (!address || address.length < 5) {
    return 'La dirección de entrega es requerida';
  }

  return null;
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  mesa: 'Mesa',
  delivery: 'Domicilio',
};
