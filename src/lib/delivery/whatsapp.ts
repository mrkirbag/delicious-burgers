import { brand } from '@/data/brand';
import type { Order } from '@/lib/db/types';

type DeliveryOrderContact = Pick<Order, 'customer_name' | 'customer_phone'>;

export function buildDeliveryReadyMessage(order: DeliveryOrderContact): string {
  const customerName = order.customer_name?.trim() || 'cliente';

  return brand.delivery.readyWhatsAppMessage
    .replaceAll('{customer_name}', customerName)
    .replaceAll('{brand_name}', brand.name);
}

export function normalizePhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;

  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('04')) {
    return `58${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('4')) {
    return `58${digits}`;
  }

  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;

  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function openDeliveryReadyWhatsApp(order: DeliveryOrderContact): boolean {
  if (!order.customer_phone?.trim()) return false;

  const url = buildWhatsAppUrl(order.customer_phone, buildDeliveryReadyMessage(order));
  if (!url) return false;

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function isDeliveryReadyForDispatch(
  order: Pick<Order, 'order_type' | 'status'>,
): boolean {
  return order.order_type === 'delivery' && order.status === 'listo';
}
