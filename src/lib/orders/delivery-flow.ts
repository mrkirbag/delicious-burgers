import type { Order, OrderStatus } from '@/lib/db/types';

export type DeliveryPaymentTiming = 'on_delivery' | 'prepaid';

export const DELIVERY_PAYMENT_TIMING_LABELS: Record<DeliveryPaymentTiming, string> = {
  on_delivery: 'Pago al entregar',
  prepaid: 'Pago anticipado (transferencia)',
};

export const DELIVERY_PAYMENT_TIMING_DESCRIPTIONS: Record<DeliveryPaymentTiming, string> = {
  on_delivery: 'Se prepara primero. Se factura y cobra cuando esté listo, antes de entregar.',
  prepaid: 'Se cobra primero por transferencia. Después se envía a cocina.',
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

export function canSendOrderToKitchen(order: Order): boolean {
  if (!isDeliveryOrder(order)) {
    return order.status === 'pendiente';
  }

  const timing = getDeliveryPaymentTiming(order);
  if (timing === 'prepaid') {
    return order.status === 'pagado';
  }

  return order.status === 'pendiente';
}

export function canPayOrder(order: Order): boolean {
  if (!isDeliveryOrder(order)) {
    return order.status === 'entregado';
  }

  const timing = getDeliveryPaymentTiming(order);
  if (timing === 'prepaid') {
    return order.status === 'pendiente';
  }

  return order.status === 'listo';
}

export function canMarkOrderDelivered(order: Order): boolean {
  if (!isDeliveryOrder(order)) {
    return order.status === 'listo';
  }

  const timing = getDeliveryPaymentTiming(order);
  if (timing === 'prepaid') {
    return order.status === 'listo';
  }

  return order.status === 'pagado';
}

export function isValidStatusTransition(order: Order, nextStatus: OrderStatus): boolean {
  if (nextStatus === 'cocina') {
    return canSendOrderToKitchen(order);
  }

  if (nextStatus === 'listo') {
    return order.status === 'cocina';
  }

  if (nextStatus === 'entregado') {
    return canMarkOrderDelivered(order);
  }

  if (nextStatus === 'cancelado') {
    return order.status === 'pendiente';
  }

  return false;
}

export function getDeliveryStatusHint(order: Order): string | null {
  if (!isDeliveryOrder(order)) {
    return null;
  }

  const timing = getDeliveryPaymentTiming(order);

  if (timing === 'on_delivery') {
    if (order.status === 'listo') {
      return 'Debe facturarse y cobrarse en caja antes de marcar como entregado.';
    }

    if (order.status === 'pagado') {
      return 'Cobrado. Ya puedes marcar el domicilio como entregado.';
    }
  }

  if (timing === 'prepaid') {
    if (order.status === 'pendiente') {
      return 'Cobra primero por transferencia. Después se envía a cocina.';
    }

    if (order.status === 'pagado') {
      return 'Pagado. Envía el pedido a cocina para prepararlo.';
    }
  }

  return null;
}

export function getPaySuccessMessage(order: Order): string {
  if (!isDeliveryOrder(order)) {
    return 'Cobrado. La mesa pasó a limpieza.';
  }

  const timing = getDeliveryPaymentTiming(order);
  if (timing === 'prepaid') {
    return 'Cobrado. Envía el pedido a cocina.';
  }

  return 'Facturado y cobrado. Ya puedes marcar el domicilio como entregado.';
}
