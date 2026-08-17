import { describe, expect, it } from 'vitest';

import type { ExchangeRates } from '@/lib/db/types';
import {
  copFromForeignAmount,
  isForeignAmountWithinRate,
  payableForeignAmount,
  settlePaymentLines,
} from '@/lib/payments/settlement';
import { roundToCents } from '@/lib/utils/currency';

const rates: ExchangeRates = {
  id: 'default',
  usd_rate: 4000,
  bs_rate: 50,
  updated_at: '2026-01-01T00:00:00.000Z',
  updated_by: null,
};

describe('USD cash settlement', () => {
  it('redondea un equivalente periódico al céntimo cobrable', () => {
    const totalCop = 26_101;
    const exactUsd = totalCop / rates.usd_rate;

    expect(exactUsd).toBeCloseTo(6.52525, 5);
    expect(payableForeignAmount(totalCop, rates.usd_rate)).toBe(6.53);
    expect(roundToCents(6.5252622772)).toBe(6.53);
  });

  it('cierra la cuenta con el céntimo más cercano aunque COP * tasa no sea exacto', () => {
    const totalCop = 26_101;
    const settled = settlePaymentLines(
      [{ method: 'usd_efectivo', amount: 6.53 }],
      totalCop,
      rates,
    );

    expect(settled.remainingCop).toBe(0);
    expect(settled.paidCop).toBe(totalCop);
    expect(settled.payments).toEqual([
      {
        payment_method: 'usd_efectivo',
        amount_cop: totalCop,
        foreign_currency: 'usd',
        foreign_amount: 6.53,
      },
    ]);
    expect(settled.tenders[0].snappedToRemaining).toBe(true);
    expect(isForeignAmountWithinRate(6.53, totalCop, rates.usd_rate)).toBe(true);
  });

  it('no cierra la cuenta si falta más de medio céntimo', () => {
    const totalCop = 26_101;
    const settled = settlePaymentLines(
      [{ method: 'usd_efectivo', amount: 6.52 }],
      totalCop,
      rates,
    );

    expect(settled.remainingCop).toBeGreaterThan(0.5);
    expect(isForeignAmountWithinRate(6.52, totalCop, rates.usd_rate)).toBe(false);
  });

  it('permite combinar dólares y pesos sin dejar residuo periódico', () => {
    const totalCop = 26_101;
    const settled = settlePaymentLines(
      [
        { method: 'usd_efectivo', amount: 3 },
        { method: 'efectivo', amount: 14_101 },
      ],
      totalCop,
      rates,
    );

    expect(settled.remainingCop).toBe(0);
    expect(settled.payments[0].amount_cop).toBe(12_000);
    expect(settled.payments[1].amount_cop).toBe(14_101);
  });

  it('ajusta el segundo pago en USD al restante periódico', () => {
    const totalCop = 26_101;
    const remainingAfterThreeDollars = totalCop - copFromForeignAmount(3, rates.usd_rate);
    const payable = payableForeignAmount(remainingAfterThreeDollars, rates.usd_rate);
    const settled = settlePaymentLines(
      [
        { method: 'usd_efectivo', amount: 3 },
        { method: 'usd_efectivo', amount: payable },
      ],
      totalCop,
      rates,
    );

    expect(payable).toBe(3.53);
    expect(settled.remainingCop).toBe(0);
    expect(settled.paidCop).toBe(totalCop);
  });
});
