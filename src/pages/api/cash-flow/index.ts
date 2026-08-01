import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import {
  getPaymentMethodBreakdownForDate,
  listCashRegisterHistory,
} from '@/lib/db/cash-registers';
import { db } from '@/lib/db/client';
import { listPaidOrdersWithPayments } from '@/lib/db/orders';
import type { CashRegisterStatus, UserRole } from '@/lib/db/types';

const CASH_FLOW_ROLES: UserRole[] = ['admin'];

async function listCashierUsers(): Promise<{ id: string; username: string }[]> {
  const result = await db.execute({
    sql: `
      SELECT id, username
      FROM users
      WHERE role IN ('admin', 'cajero') AND active = 1
      ORDER BY username ASC
    `,
    args: [],
  });

  return result.rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
  }));
}

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, CASH_FLOW_ROLES);
  if (auth instanceof Response) return auth;

  const { searchParams } = context.url;
  const today = new Date().toISOString().slice(0, 10);
  const date = searchParams.get('date') ?? today;
  const openedBy = searchParams.get('opened_by') ?? undefined;
  const statusParam = searchParams.get('status') ?? 'all';

  const status: CashRegisterStatus | 'all' =
    statusParam === 'open' || statusParam === 'closed' ? statusParam : 'all';

  const [sessions, cashiers, orders, paymentBreakdown] = await Promise.all([
    listCashRegisterHistory({ date, openedBy, status }),
    listCashierUsers(),
    listPaidOrdersWithPayments({
      dateFrom: date,
      dateTo: date,
      cashierId: openedBy,
    }),
    getPaymentMethodBreakdownForDate(date, openedBy),
  ]);

  return Response.json({
    sessions,
    orders,
    paymentBreakdown,
    filters: { cashiers },
  });
};
