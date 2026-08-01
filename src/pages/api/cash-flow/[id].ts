import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { getCashRegisterById, getPaymentMethodBreakdown } from '@/lib/db/cash-registers';
import { listPaidOrdersWithPayments } from '@/lib/db/orders';
import type { UserRole } from '@/lib/db/types';

const CASH_FLOW_ROLES: UserRole[] = ['admin'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, CASH_FLOW_ROLES);
  if (auth instanceof Response) return auth;

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const [session, paymentBreakdown, orders] = await Promise.all([
    getCashRegisterById(id),
    getPaymentMethodBreakdown(id),
    listPaidOrdersWithPayments({ cashRegisterId: id }),
  ]);

  if (!session) {
    return Response.json({ error: 'Turno de caja no encontrado' }, { status: 404 });
  }

  return Response.json({
    session,
    paymentBreakdown,
    orders,
  });
};
