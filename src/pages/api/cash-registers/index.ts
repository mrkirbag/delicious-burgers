import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { getActiveCashRegister, openCashRegister } from '@/lib/db/cash-registers';
import type { UserRole } from '@/lib/db/types';

const CAJA_ROLES: UserRole[] = ['admin', 'cajero'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, CAJA_ROLES);
  if (auth instanceof Response) return auth;

  const register = await getActiveCashRegister();
  return Response.json({ register });
};

export const POST: APIRoute = async (context) => {
  const session = requireRoles(context, CAJA_ROLES);
  if (session instanceof Response) return session;

  let body: { initial_balance?: number; initial_balance_usd?: number };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const initialBalanceCop = body.initial_balance ?? 0;
  const initialBalanceUsd = body.initial_balance_usd ?? 0;

  try {
    const register = await openCashRegister(
      session.userId,
      initialBalanceCop,
      initialBalanceUsd,
    );
    return Response.json({ register }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo abrir la caja';
    return Response.json({ error: message }, { status: 400 });
  }
};
