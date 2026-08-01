import { db } from './client';
import type { ExchangeRates } from './types';

const DEFAULT_RATES: ExchangeRates = {
  id: 'default',
  usd_rate: 4000,
  bs_rate: 50,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

function mapRow(row: Record<string, unknown>): ExchangeRates {
  return {
    id: String(row.id),
    usd_rate: Number(row.usd_rate),
    bs_rate: Number(row.bs_rate),
    updated_at: String(row.updated_at),
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

export async function getExchangeRates(): Promise<ExchangeRates> {
  const result = await db.execute(
    `SELECT id, usd_rate, bs_rate, updated_at, updated_by FROM exchange_rates WHERE id = 'default'`,
  );

  if (result.rows.length === 0) {
    return DEFAULT_RATES;
  }

  return mapRow(result.rows[0] as Record<string, unknown>);
}

export type UpdateExchangeRatesInput = {
  usd_rate: number;
  bs_rate: number;
  updated_by: string;
};

export async function updateExchangeRates(input: UpdateExchangeRatesInput): Promise<ExchangeRates> {
  const now = new Date().toISOString();

  const existing = await db.execute(`SELECT id FROM exchange_rates WHERE id = 'default'`);

  if (existing.rows.length === 0) {
    await db.execute({
      sql: `
        INSERT INTO exchange_rates (id, usd_rate, bs_rate, updated_at, updated_by)
        VALUES ('default', ?, ?, ?, ?)
      `,
      args: [input.usd_rate, input.bs_rate, now, input.updated_by],
    });
  } else {
    await db.execute({
      sql: `
        UPDATE exchange_rates
        SET usd_rate = ?, bs_rate = ?, updated_at = ?, updated_by = ?
        WHERE id = 'default'
      `,
      args: [input.usd_rate, input.bs_rate, now, input.updated_by],
    });
  }

  return getExchangeRates();
}
