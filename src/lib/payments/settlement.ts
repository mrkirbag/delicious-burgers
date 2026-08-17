import type { ExchangeRates, ForeignCurrency, OrderPaymentInput, PaymentMethod } from '@/lib/db/types';
import { isBsPaymentMethod, isUsdPaymentMethod } from '@/lib/payments/methods';
import { roundCop, roundToCents } from '@/lib/utils/currency';

export type TenderLine = {
  method: PaymentMethod;
  amount: number;
};

export type SettledTender = {
  method: PaymentMethod;
  amount: number;
  amountCop: number;
  foreignAmount: number | null;
  foreignCurrency: ForeignCurrency | null;
  snappedToRemaining: boolean;
};

/**
 * Half a cent of foreign currency, in COP.
 * That is the maximum error from rounding a periodic conversion to payable cents.
 */
export function foreignRoundingToleranceCop(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return Math.max(1, Math.ceil(rate / 200));
}

export function copFromForeignAmount(foreignAmount: number, rate: number): number {
  return roundCop(roundToCents(foreignAmount) * rate);
}

export function payableForeignAmount(remainingCop: number, rate: number): number {
  if (!Number.isFinite(remainingCop) || remainingCop <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }

  return roundToCents(remainingCop / rate);
}

export function copCreditedForForeignAmount(
  foreignAmount: number,
  rate: number,
  remainingCop: number,
): { amountCop: number; snappedToRemaining: boolean } {
  const converted = copFromForeignAmount(foreignAmount, rate);
  const tolerance = foreignRoundingToleranceCop(rate);

  if (Math.abs(converted - remainingCop) <= tolerance) {
    return { amountCop: remainingCop, snappedToRemaining: converted !== remainingCop };
  }

  return { amountCop: converted, snappedToRemaining: false };
}

export function isForeignAmountWithinRate(
  foreignAmount: number,
  amountCop: number,
  rate: number,
): boolean {
  const expectedCop = copFromForeignAmount(foreignAmount, rate);
  return Math.abs(expectedCop - amountCop) <= foreignRoundingToleranceCop(rate);
}

export function settlePaymentLines(
  lines: TenderLine[],
  orderTotalCop: number,
  rates: ExchangeRates | null,
): {
  tenders: SettledTender[];
  payments: OrderPaymentInput[];
  paidCop: number;
  remainingCop: number;
} {
  const tenders: SettledTender[] = [];
  let remainingCop = orderTotalCop;

  for (const line of lines) {
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      tenders.push({
        method: line.method,
        amount: 0,
        amountCop: 0,
        foreignAmount: null,
        foreignCurrency: null,
        snappedToRemaining: false,
      });
      continue;
    }

    if (isUsdPaymentMethod(line.method)) {
      const rate = rates?.usd_rate ?? 0;
      if (!rates || rate <= 0) {
        tenders.push({
          method: line.method,
          amount,
          amountCop: 0,
          foreignAmount: null,
          foreignCurrency: 'usd',
          snappedToRemaining: false,
        });
        continue;
      }

      const foreignAmount = roundToCents(amount);
      const credited = copCreditedForForeignAmount(foreignAmount, rate, remainingCop);
      tenders.push({
        method: line.method,
        amount: foreignAmount,
        amountCop: credited.amountCop,
        foreignAmount,
        foreignCurrency: 'usd',
        snappedToRemaining: credited.snappedToRemaining,
      });
      remainingCop -= credited.amountCop;
      continue;
    }

    if (isBsPaymentMethod(line.method)) {
      const rate = rates?.bs_rate ?? 0;
      if (!rates || rate <= 0) {
        tenders.push({
          method: line.method,
          amount,
          amountCop: 0,
          foreignAmount: null,
          foreignCurrency: 'bs',
          snappedToRemaining: false,
        });
        continue;
      }

      const foreignAmount = roundToCents(amount);
      const credited = copCreditedForForeignAmount(foreignAmount, rate, remainingCop);
      tenders.push({
        method: line.method,
        amount: foreignAmount,
        amountCop: credited.amountCop,
        foreignAmount,
        foreignCurrency: 'bs',
        snappedToRemaining: credited.snappedToRemaining,
      });
      remainingCop -= credited.amountCop;
      continue;
    }

    tenders.push({
      method: line.method,
      amount,
      amountCop: amount,
      foreignAmount: null,
      foreignCurrency: null,
      snappedToRemaining: false,
    });
    remainingCop -= amount;
  }

  const payments: OrderPaymentInput[] = tenders
    .filter((tender) => tender.amountCop > 0)
    .map((tender) => ({
      payment_method: tender.method,
      amount_cop: tender.amountCop,
      foreign_currency: tender.foreignCurrency,
      foreign_amount: tender.foreignAmount,
    }));

  return {
    tenders,
    payments,
    paidCop: orderTotalCop - remainingCop,
    remainingCop,
  };
}

export function payableAmountForMethod(
  method: PaymentMethod,
  remainingCop: number,
  rates: ExchangeRates | null,
): string {
  if (remainingCop <= 0) return '';

  if (isUsdPaymentMethod(method)) {
    if (!rates || rates.usd_rate <= 0) return '';
    return payableForeignAmount(remainingCop, rates.usd_rate).toFixed(2);
  }

  if (isBsPaymentMethod(method)) {
    if (!rates || rates.bs_rate <= 0) return '';
    return payableForeignAmount(remainingCop, rates.bs_rate).toFixed(2);
  }

  return String(Math.max(0, roundCop(remainingCop)));
}
