import { createId } from '@/lib/utils/id';

import { db } from './client';
import type { ForeignCurrency, OrderPayment, OrderPaymentInput, PaymentMethod } from './types';

function mapPayment(row: Record<string, unknown>): OrderPayment {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    payment_method: row.payment_method as PaymentMethod,
    amount_cop: Number(row.amount_cop),
    foreign_currency: row.foreign_currency
      ? (row.foreign_currency as ForeignCurrency)
      : null,
    foreign_amount: row.foreign_amount != null ? Number(row.foreign_amount) : null,
    created_at: String(row.created_at),
  };
}

export async function listOrderPayments(orderId: string): Promise<OrderPayment[]> {
  const result = await db.execute({
    sql: `
      SELECT id, order_id, payment_method, amount_cop, foreign_currency, foreign_amount, created_at
      FROM order_payments
      WHERE order_id = ?
      ORDER BY created_at ASC
    `,
    args: [orderId],
  });

  return result.rows.map((row) => mapPayment(row as Record<string, unknown>));
}

export async function listPaymentsForOrderIds(orderIds: string[]): Promise<OrderPayment[]> {
  if (orderIds.length === 0) return [];

  const placeholders = orderIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `
      SELECT id, order_id, payment_method, amount_cop, foreign_currency, foreign_amount, created_at
      FROM order_payments
      WHERE order_id IN (${placeholders})
      ORDER BY created_at ASC
    `,
    args: orderIds,
  });

  return result.rows.map((row) => mapPayment(row as Record<string, unknown>));
}

export async function createOrderPayments(
  orderId: string,
  payments: OrderPaymentInput[],
): Promise<OrderPayment[]> {
  const now = new Date().toISOString();
  const statements = payments.map((payment) => ({
    sql: `
      INSERT INTO order_payments (id, order_id, payment_method, amount_cop, foreign_currency, foreign_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      createId(),
      orderId,
      payment.payment_method,
      payment.amount_cop,
      payment.foreign_currency ?? null,
      payment.foreign_amount ?? null,
      now,
    ],
  }));

  await db.batch(statements);
  return listOrderPayments(orderId);
}
