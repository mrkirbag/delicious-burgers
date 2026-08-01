import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { db } from '@/lib/db/client';
import { listPaidOrders } from '@/lib/db/orders';
import { listTables } from '@/lib/db/tables';
import type { UserRole } from '@/lib/db/types';

const INVOICE_ROLES: UserRole[] = ['admin', 'cajero'];

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
  const auth = requireRoles(context, INVOICE_ROLES);
  if (auth instanceof Response) return auth;

  const { searchParams } = context.url;
  const dateFrom = searchParams.get('date_from') ?? undefined;
  const dateTo = searchParams.get('date_to') ?? undefined;
  const tableId = searchParams.get('table_id') ?? undefined;
  const cashierId = searchParams.get('cashier_id') ?? undefined;

  const [invoices, tables, cashiers] = await Promise.all([
    listPaidOrders({ dateFrom, dateTo, tableId, cashierId }),
    listTables(),
    listCashierUsers(),
  ]);

  return Response.json({
    invoices,
    filters: {
      tables: tables.map((t) => ({ id: t.id, number: t.number })),
      cashiers,
    },
  });
};
