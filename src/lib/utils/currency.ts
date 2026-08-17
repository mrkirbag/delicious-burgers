import { brand } from '@/data/brand';
import type { ExchangeRates, ForeignCurrency } from '@/lib/db/types';

export function formatCop(value: number): string {
  return new Intl.NumberFormat(brand.currency.locale, {
    style: 'currency',
    currency: brand.currency.code,
    minimumFractionDigits: brand.currency.code === 'COP' ? 0 : 2,
    maximumFractionDigits: brand.currency.code === 'COP' ? 0 : 2,
  }).format(value);
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatBs(value: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Rounds to the nearest cent. Cash and transfers cannot be paid with repeating decimals. */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function roundCop(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function convertCopToUsd(amountCop: number, rates: Pick<ExchangeRates, 'usd_rate'>): number {
  if (rates.usd_rate <= 0) return 0;
  return amountCop / rates.usd_rate;
}

export function convertCopToBs(amountCop: number, rates: Pick<ExchangeRates, 'bs_rate'>): number {
  if (rates.bs_rate <= 0) return 0;
  return amountCop / rates.bs_rate;
}

export function convertUsdToCop(amountUsd: number, rates: Pick<ExchangeRates, 'usd_rate'>): number {
  if (rates.usd_rate <= 0) return 0;
  return roundCop(amountUsd * rates.usd_rate);
}

export function convertBsToCop(amountBs: number, rates: Pick<ExchangeRates, 'bs_rate'>): number {
  if (rates.bs_rate <= 0) return 0;
  return roundCop(amountBs * rates.bs_rate);
}

export function formatForeignAmount(
  amountCop: number,
  currency: ForeignCurrency,
  rates: ExchangeRates,
): string {
  if (currency === 'usd') {
    return formatUsd(convertCopToUsd(amountCop, rates));
  }

  return formatBs(convertCopToBs(amountCop, rates));
}
