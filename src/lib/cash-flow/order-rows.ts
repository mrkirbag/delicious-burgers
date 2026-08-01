import type { PaidOrderWithPayments } from '@/lib/db/orders';
import type { OrderPayment } from '@/lib/db/types';
import { formatOrderLabel } from '@/lib/orders/display';
import { getPaymentLabel } from '@/lib/payments/methods';
import { formatTime } from '@/lib/utils/datetime';
import { formatBs, formatCop, formatUsd } from '@/lib/utils/currency';

export type OrderPaymentRow = {
  key: string;
  orderId: string;
  orderLabel: string;
  time: string;
  orderTotal: number;
  payment: OrderPayment;
  showOrderMeta: boolean;
};

export function formatPaymentAmount(payment: OrderPayment): string {
  if (payment.foreign_currency === 'usd' && payment.foreign_amount != null) {
    return formatUsd(payment.foreign_amount);
  }
  if (payment.foreign_currency === 'bs' && payment.foreign_amount != null) {
    return formatBs(payment.foreign_amount);
  }
  return formatCop(payment.amount_cop);
}

export function buildOrderPaymentRows(orders: PaidOrderWithPayments[]): OrderPaymentRow[] {
  const rows: OrderPaymentRow[] = [];

  for (const order of orders) {
    const payments = order.payments.length > 0 ? order.payments : [];

    if (payments.length === 0) {
      rows.push({
        key: order.id,
        orderId: order.id,
        orderLabel: formatOrderLabel(order),
        time: formatTime(order.updated_at),
        orderTotal: order.total,
        payment: {
          id: `${order.id}-legacy`,
          order_id: order.id,
          payment_method: order.payment_method,
          amount_cop: order.total,
          foreign_currency: order.foreign_currency,
          foreign_amount: null,
          created_at: order.updated_at,
        },
        showOrderMeta: true,
      });
      continue;
    }

    payments.forEach((payment, index) => {
      rows.push({
        key: `${order.id}-${payment.id}`,
        orderId: order.id,
        orderLabel: formatOrderLabel(order),
        time: formatTime(order.updated_at),
        orderTotal: order.total,
        payment,
        showOrderMeta: index === 0,
      });
    });
  }

  return rows;
}

export function groupOrderPaymentRows(rows: OrderPaymentRow[]): OrderPaymentRow[][] {
  const groups: OrderPaymentRow[][] = [];
  let current: OrderPaymentRow[] = [];

  for (const row of rows) {
    if (row.showOrderMeta && current.length > 0) {
      groups.push(current);
      current = [row];
      continue;
    }

    current.push(row);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

export function formatPaymentMethodLabel(payment: OrderPayment): string {
  return getPaymentLabel(payment.payment_method, payment.foreign_currency);
}
