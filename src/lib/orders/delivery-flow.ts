import type { Order, OrderStatus } from '@/lib/db/types';

export type DeliveryPaymentTiming = 'on_delivery' | 'prepaid';

export const DELIVERY_PAYMENT_TIMING_LABELS: Record<DeliveryPaymentTiming, string> = {
  on_delivery: 'Pago en caja',
  prepaid: 'Transferencia anticipada',
};

export const DELIVERY_PAYMENT_TIMING_DESCRIPTIONS: Record<DeliveryPaymentTiming, string> = {
  on_delivery: 'Se cobra al tomar el pedido y pasa solo a cocina.',
  prepaid: 'Se cobra por transferencia al tomar el pedido y pasa solo a cocina.',
};

export function isDeliveryOrder(order: Pick<Order, 'order_type'>): boolean {
  return order.order_type === 'delivery';
}

export function getDeliveryPaymentTiming(
  order: Pick<Order, 'order_type' | 'delivery_payment_timing'>,
): DeliveryPaymentTiming {
  if (order.order_type !== 'delivery') {
    return 'on_delivery';
  }

  return order.delivery_payment_timing ?? 'on_delivery';
}

/** Cobrar/facturar con la comanda pendiente (flujo nuevo). Incluye estados legacy. */
export function canPayOrder(order: Order): boolean {
  if (order.status === 'pendiente') {
    return true;
  }

  // Legacy: mesa ya entregada sin cobrar
  if (!isDeliveryOrder(order) && order.status === 'entregado' && !order.cash_register_id) {
    return true;
  }

  // Legacy: domicilio listo sin cobrar
  if (
    isDeliveryOrder(order) &&
    getDeliveryPaymentTiming(order) === 'on_delivery' &&
    order.status === 'listo' &&
    !order.cash_register_id
  ) {
    return true;
  }

  return false;
}

/** Solo para comandas legacy que quedaron en pagado sin ir a cocina. */
export function canSendOrderToKitchen(order: Order): boolean {
  return order.status === 'pagado';
}

/** Legacy: entregar si quedó en listo (flujo anterior de dos clics). */
export function canMarkOrderDelivered(order: Order): boolean {
  return order.status === 'listo' && Boolean(order.cash_register_id);
}

export function isValidStatusTransition(order: Order, nextStatus: OrderStatus): boolean {
  if (nextStatus === 'cocina') {
    return canSendOrderToKitchen(order);
  }

  // Cocina "listo" = entregar de una vez (markOrderReady → entregado)
  if (nextStatus === 'listo') {
    return order.status === 'cocina';
  }

  if (nextStatus === 'entregado') {
    return order.status === 'cocina' || canMarkOrderDelivered(order);
  }

  if (nextStatus === 'cancelado') {
    return order.status === 'pendiente';
  }

  return false;
}

export function getOrderStatusHint(order: Order): string | null {
  if (order.status === 'pendiente') {
    return 'Cobra en caja. El pedido pasará a cocina automáticamente.';
  }

  if (order.status === 'pagado') {
    return 'Pagado. Envía el pedido a cocina.';
  }

  if (order.status === 'cocina') {
    return 'En cocina. Al marcar listo queda entregado y la mesa pasa a limpieza.';
  }

  if (order.status === 'listo') {
    if (canPayOrder(order)) {
      return 'Listo. Cobra en caja para cerrar.';
    }
    return 'Listo. Márcalo como entregado (comanda del flujo anterior).';
  }

  if (order.status === 'entregado' && canPayOrder(order)) {
    return 'Entregado. Cobra en caja para cerrar la comanda.';
  }

  if (order.status === 'entregado' && !isDeliveryOrder(order)) {
    return 'Entregado. Libera la mesa desde Mesas cuando esté limpia.';
  }

  return null;
}

/** @deprecated Use getOrderStatusHint */
export function getDeliveryStatusHint(order: Order): string | null {
  if (!isDeliveryOrder(order)) {
    return null;
  }

  return getOrderStatusHint(order);
}

export function getPaySuccessMessage(order: Order): string {
  if (!isDeliveryOrder(order)) {
    if (order.status === 'entregado') {
      return 'Cobrado. La mesa pasó a limpieza.';
    }
    return 'Cobrado. El pedido ya está en cocina.';
  }

  if (order.status === 'listo') {
    return 'Facturado y cobrado.';
  }

  return 'Cobrado. El pedido ya está en cocina.';
}
