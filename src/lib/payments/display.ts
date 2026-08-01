import { formatBs, formatCop, formatUsd } from '@/lib/utils/currency';
import { getPaymentLabel } from '@/lib/payments/methods';
import type { OrderPaymentInput } from '@/lib/db/types';

type PaymentLike = Pick<
  OrderPaymentInput,
  'payment_method' | 'amount_cop' | 'foreign_currency' | 'foreign_amount'
>;

export function formatOrderPaymentLine(payment: PaymentLike): string {
  if (payment.foreign_currency === 'usd' && payment.foreign_amount != null) {
    return `${getPaymentLabel(payment.payment_method, payment.foreign_currency)} ${formatUsd(payment.foreign_amount)} (${formatCop(payment.amount_cop)})`;
  }

  if (payment.foreign_currency === 'bs' && payment.foreign_amount != null) {
    return `${getPaymentLabel(payment.payment_method, payment.foreign_currency)} ${formatBs(payment.foreign_amount)} (${formatCop(payment.amount_cop)})`;
  }

  return `${getPaymentLabel(payment.payment_method)} · ${formatCop(payment.amount_cop)}`;
}

export function formatOrderPaymentPreview(
  payments: PaymentLike[],
  fallback = 'Pendiente de cobro',
): string {
  if (payments.length === 0) return fallback;
  if (payments.length === 1) return formatOrderPaymentLine(payments[0]);
  return payments.map((payment) => formatOrderPaymentLine(payment)).join(' · ');
}
