import { createId } from '@/lib/utils/id';

import { ALL_PAYMENT_METHODS, isValidPaymentMethod } from '@/lib/payments/methods';

import { db } from './client';
import type { SqlArgs } from './sql';
import type { CashRegister, CashRegisterStatus, ForeignCurrency, PaymentMethod } from './types';

export type CashFlowFilters = {
  date?: string;
  openedBy?: string;
  status?: CashRegisterStatus | 'all';
};

export type PaymentMethodBreakdown = {
  payment_method: PaymentMethod;
  foreign_currency: ForeignCurrency | null;
  total_cop: number;
  total_foreign: number | null;
};

export type CashRegisterWithUser = CashRegister & {
  opened_by_username: string;
  closed_by_username: string | null;
};

export type CashRegisterSummary = CashRegisterWithUser & {
  total_sales: number;
  cash_sales: number;
  card_sales: number;
  mobile_sales: number;
  usd_sales: number;
  bs_sales: number;
  foreign_sales: number;
  usd_cash_collected: number;
  paid_order_count: number;
  theoretical_cash_balance: number;
  theoretical_cash_balance_usd: number;
};

function mapCashRegister(row: Record<string, unknown>): CashRegisterWithUser {
  return {
    id: String(row.id),
    opened_by: String(row.opened_by),
    closed_by: row.closed_by ? String(row.closed_by) : null,
    initial_balance: Number(row.initial_balance),
    initial_balance_usd: Number(row.initial_balance_usd ?? 0),
    final_balance: row.final_balance != null ? Number(row.final_balance) : null,
    final_balance_usd: row.final_balance_usd != null ? Number(row.final_balance_usd) : null,
    actual_balance: row.actual_balance != null ? Number(row.actual_balance) : null,
    actual_balance_usd: row.actual_balance_usd != null ? Number(row.actual_balance_usd) : null,
    opened_at: String(row.opened_at),
    closed_at: row.closed_at ? String(row.closed_at) : null,
    status: row.status as CashRegister['status'],
    opened_by_username: String(row.opened_by_username),
    closed_by_username: row.closed_by_username ? String(row.closed_by_username) : null,
  };
}

const CASH_REGISTER_SELECT = `
  SELECT
    cr.id,
    cr.opened_by,
    cr.closed_by,
    cr.initial_balance,
    cr.initial_balance_usd,
    cr.final_balance,
    cr.final_balance_usd,
    cr.actual_balance,
    cr.actual_balance_usd,
    cr.opened_at,
    cr.closed_at,
    cr.status,
    opener.username AS opened_by_username,
    closer.username AS closed_by_username
  FROM cash_registers cr
  INNER JOIN users opener ON opener.id = cr.opened_by
  LEFT JOIN users closer ON closer.id = cr.closed_by
`;

async function getPaymentTotals(cashRegisterId: string): Promise<{
  total_sales: number;
  cash_sales: number;
  card_sales: number;
  mobile_sales: number;
  usd_sales: number;
  bs_sales: number;
  foreign_sales: number;
  usd_cash_collected: number;
  paid_order_count: number;
}> {
  const salesResult = await db.execute({
    sql: `
      SELECT COALESCE(SUM(total), 0) AS total_sales, COUNT(*) AS paid_order_count
      FROM orders
      WHERE cash_register_id = ?
        AND status = 'pagado'
    `,
    args: [cashRegisterId],
  });

  const paymentsResult = await db.execute({
    sql: `
      SELECT
        COALESCE(SUM(CASE WHEN op.payment_method = 'efectivo' THEN op.amount_cop ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN op.payment_method = 'punto_de_venta' THEN op.amount_cop ELSE 0 END), 0) AS card_sales,
        COALESCE(SUM(CASE WHEN op.payment_method = 'pago_movil' THEN op.amount_cop ELSE 0 END), 0) AS mobile_sales,
        COALESCE(SUM(
          CASE
            WHEN op.payment_method IN ('usd_efectivo', 'zelle', 'binance_usdt')
              OR (op.payment_method = 'divisas' AND op.foreign_currency = 'usd')
            THEN op.amount_cop
            ELSE 0
          END
        ), 0) AS usd_sales,
        COALESCE(SUM(
          CASE WHEN op.payment_method = 'divisas' AND op.foreign_currency = 'bs' THEN op.amount_cop ELSE 0 END
        ), 0) AS bs_sales,
        COALESCE(SUM(
          CASE
            WHEN op.payment_method IN ('usd_efectivo', 'zelle', 'binance_usdt', 'divisas')
            THEN op.amount_cop
            ELSE 0
          END
        ), 0) AS foreign_sales,
        COALESCE(SUM(
          CASE
            WHEN op.payment_method = 'usd_efectivo'
              OR (op.payment_method = 'divisas' AND op.foreign_currency = 'usd')
            THEN COALESCE(op.foreign_amount, 0)
            ELSE 0
          END
        ), 0) AS usd_cash_collected
      FROM order_payments op
      INNER JOIN orders o ON o.id = op.order_id
      WHERE o.cash_register_id = ?
        AND o.status = 'pagado'
    `,
    args: [cashRegisterId],
  });

  const salesRow = salesResult.rows[0] as Record<string, unknown>;
  const paymentsRow = paymentsResult.rows[0] as Record<string, unknown>;

  return {
    total_sales: Number(salesRow.total_sales),
    cash_sales: Number(paymentsRow.cash_sales),
    card_sales: Number(paymentsRow.card_sales),
    mobile_sales: Number(paymentsRow.mobile_sales),
    usd_sales: Number(paymentsRow.usd_sales),
    bs_sales: Number(paymentsRow.bs_sales),
    foreign_sales: Number(paymentsRow.foreign_sales),
    usd_cash_collected: Number(paymentsRow.usd_cash_collected),
    paid_order_count: Number(salesRow.paid_order_count),
  };
}

async function buildSummary(register: CashRegisterWithUser): Promise<CashRegisterSummary> {
  const totals = await getPaymentTotals(register.id);

  return {
    ...register,
    ...totals,
    theoretical_cash_balance: register.initial_balance + totals.cash_sales,
    theoretical_cash_balance_usd: register.initial_balance_usd + totals.usd_cash_collected,
  };
}

export async function getActiveCashRegister(): Promise<CashRegisterSummary | null> {
  const result = await db.execute({
    sql: `${CASH_REGISTER_SELECT} WHERE cr.status = 'open' ORDER BY cr.opened_at DESC LIMIT 1`,
    args: [],
  });

  if (result.rows.length === 0) return null;

  return buildSummary(mapCashRegister(result.rows[0] as Record<string, unknown>));
}

export async function getCashRegisterById(id: string): Promise<CashRegisterSummary | null> {
  const result = await db.execute({
    sql: `${CASH_REGISTER_SELECT} WHERE cr.id = ? LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return null;

  return buildSummary(mapCashRegister(result.rows[0] as Record<string, unknown>));
}

export async function listCashRegisterHistory(
  filters: CashFlowFilters = {},
): Promise<CashRegisterSummary[]> {
  const conditions: string[] = [];
  const args: SqlArgs = [];

  if (filters.date) {
    conditions.push('cr.opened_at >= ?');
    args.push(filters.date);
    conditions.push('cr.opened_at <= ?');
    args.push(`${filters.date}T23:59:59.999Z`);
  }

  if (filters.openedBy) {
    conditions.push('cr.opened_by = ?');
    args.push(filters.openedBy);
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push('cr.status = ?');
    args.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.execute({
    sql: `${CASH_REGISTER_SELECT} ${whereClause} ORDER BY cr.opened_at DESC`,
    args,
  });

  const registers = result.rows.map((row) =>
    mapCashRegister(row as Record<string, unknown>),
  );

  return Promise.all(registers.map((register) => buildSummary(register)));
}

export async function getPaymentMethodBreakdown(
  cashRegisterId: string,
): Promise<PaymentMethodBreakdown[]> {
  const result = await db.execute({
    sql: `
      SELECT
        op.payment_method,
        op.foreign_currency,
        COALESCE(SUM(op.amount_cop), 0) AS total_cop,
        SUM(COALESCE(op.foreign_amount, 0)) AS total_foreign
      FROM order_payments op
      INNER JOIN orders o ON o.id = op.order_id
      WHERE o.cash_register_id = ?
        AND o.status = 'pagado'
      GROUP BY op.payment_method, op.foreign_currency
      ORDER BY total_cop DESC
    `,
    args: [cashRegisterId],
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    const foreignAmount = record.total_foreign != null ? Number(record.total_foreign) : null;

    return {
      payment_method: record.payment_method as PaymentMethod,
      foreign_currency: record.foreign_currency
        ? (String(record.foreign_currency) as ForeignCurrency)
        : null,
      total_cop: Number(record.total_cop),
      total_foreign: foreignAmount && foreignAmount > 0 ? foreignAmount : null,
    };
  });
}

export async function getPaymentMethodBreakdownForDate(
  date: string,
  openedBy?: string,
): Promise<PaymentMethodBreakdown[]> {
  const conditions = [
    "o.status = 'pagado'",
    'o.updated_at >= ?',
    'o.updated_at <= ?',
  ];
  const args: SqlArgs = [date, `${date}T23:59:59.999Z`];

  if (openedBy) {
    conditions.push('cr.opened_by = ?');
    args.push(openedBy);
  }

  const result = await db.execute({
    sql: `
      SELECT
        op.payment_method,
        op.foreign_currency,
        COALESCE(SUM(op.amount_cop), 0) AS total_cop,
        SUM(COALESCE(op.foreign_amount, 0)) AS total_foreign
      FROM order_payments op
      INNER JOIN orders o ON o.id = op.order_id
      LEFT JOIN cash_registers cr ON cr.id = o.cash_register_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY op.payment_method, op.foreign_currency
      ORDER BY total_cop DESC
    `,
    args,
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    const foreignAmount = record.total_foreign != null ? Number(record.total_foreign) : null;

    return {
      payment_method: record.payment_method as PaymentMethod,
      foreign_currency: record.foreign_currency
        ? (String(record.foreign_currency) as ForeignCurrency)
        : null,
      total_cop: Number(record.total_cop),
      total_foreign: foreignAmount && foreignAmount > 0 ? foreignAmount : null,
    };
  });
}

export async function openCashRegister(
  openedBy: string,
  initialBalanceCop: number,
  initialBalanceUsd: number,
): Promise<CashRegisterSummary> {
  const active = await getActiveCashRegister();
  if (active) {
    throw new Error('Ya hay una caja abierta. Ciérrala antes de abrir otra.');
  }

  if (!Number.isFinite(initialBalanceCop) || initialBalanceCop < 0) {
    throw new Error('Saldo inicial en pesos inválido');
  }

  if (!Number.isFinite(initialBalanceUsd) || initialBalanceUsd < 0) {
    throw new Error('Saldo inicial en dólares inválido');
  }

  const id = createId();
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO cash_registers (id, opened_by, initial_balance, initial_balance_usd, opened_at, status)
      VALUES (?, ?, ?, ?, ?, 'open')
    `,
    args: [id, openedBy, initialBalanceCop, initialBalanceUsd, now],
  });

  const register = await getCashRegisterById(id);
  if (!register) throw new Error('No se pudo abrir la caja');
  return register;
}

export async function closeCashRegister(
  id: string,
  closedBy: string,
  actualBalanceCop: number,
  actualBalanceUsd: number,
): Promise<CashRegisterSummary> {
  const register = await getCashRegisterById(id);
  if (!register) {
    throw new Error('Caja no encontrada');
  }

  if (register.status !== 'open') {
    throw new Error('La caja ya está cerrada');
  }

  if (!Number.isFinite(actualBalanceCop) || actualBalanceCop < 0) {
    throw new Error('Saldo contado en pesos inválido');
  }

  if (!Number.isFinite(actualBalanceUsd) || actualBalanceUsd < 0) {
    throw new Error('Saldo contado en dólares inválido');
  }

  const totals = await getPaymentTotals(id);
  const theoreticalCashCop = register.initial_balance + totals.cash_sales;
  const theoreticalCashUsd = register.initial_balance_usd + totals.usd_cash_collected;
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      UPDATE cash_registers
      SET
        closed_by = ?,
        final_balance = ?,
        final_balance_usd = ?,
        actual_balance = ?,
        actual_balance_usd = ?,
        closed_at = ?,
        status = 'closed'
      WHERE id = ?
    `,
    args: [
      closedBy,
      theoreticalCashCop,
      theoreticalCashUsd,
      actualBalanceCop,
      actualBalanceUsd,
      now,
      id,
    ],
  });

  const closed = await getCashRegisterById(id);
  if (!closed) throw new Error('No se pudo cerrar la caja');
  return closed;
}

export async function assertCashRegisterOpen(cashRegisterId: string): Promise<CashRegister> {
  const result = await db.execute({
    sql: `
      SELECT
        id,
        opened_by,
        closed_by,
        initial_balance,
        initial_balance_usd,
        final_balance,
        final_balance_usd,
        actual_balance,
        actual_balance_usd,
        opened_at,
        closed_at,
        status
      FROM cash_registers
      WHERE id = ?
      LIMIT 1
    `,
    args: [cashRegisterId],
  });

  if (result.rows.length === 0) {
    throw new Error('Caja no encontrada');
  }

  const row = result.rows[0] as Record<string, unknown>;
  const status = row.status as CashRegister['status'];

  if (status !== 'open') {
    throw new Error('La caja no está abierta');
  }

  return {
    id: String(row.id),
    opened_by: String(row.opened_by),
    closed_by: row.closed_by ? String(row.closed_by) : null,
    initial_balance: Number(row.initial_balance),
    initial_balance_usd: Number(row.initial_balance_usd ?? 0),
    final_balance: row.final_balance != null ? Number(row.final_balance) : null,
    final_balance_usd: row.final_balance_usd != null ? Number(row.final_balance_usd) : null,
    actual_balance: row.actual_balance != null ? Number(row.actual_balance) : null,
    actual_balance_usd: row.actual_balance_usd != null ? Number(row.actual_balance_usd) : null,
    opened_at: String(row.opened_at),
    closed_at: row.closed_at ? String(row.closed_at) : null,
    status,
  };
}

export { ALL_PAYMENT_METHODS as PAYMENT_METHODS, isValidPaymentMethod };
