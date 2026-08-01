import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { closeCashRegister, getCashRegisterById } from '@/lib/db/cash-registers';
import type { UserRole } from '@/lib/db/types';

const CAJA_ROLES: UserRole[] = ['admin', 'cajero'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, CAJA_ROLES);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const register = await getCashRegisterById(id);
  if (!register) {
    return Response.json({ error: 'Caja no encontrada' }, { status: 404 });
  }

  return Response.json({ register });
};

export const PATCH: APIRoute = async (context) => {
  const session = requireRoles(context, CAJA_ROLES);
  if (session instanceof Response) return session;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  let body: { actual_balance?: number; actual_balance_usd?: number };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  if (body.actual_balance === undefined) {
    return Response.json({ error: 'actual_balance es requerido' }, { status: 400 });
  }

  if (body.actual_balance_usd === undefined) {
    return Response.json({ error: 'actual_balance_usd es requerido' }, { status: 400 });
  }

  try {
    const register = await closeCashRegister(
      id,
      session.userId,
      body.actual_balance,
      body.actual_balance_usd,
    );
    return Response.json({ register });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cerrar la caja';
    return Response.json({ error: message }, { status: 400 });
  }
};
