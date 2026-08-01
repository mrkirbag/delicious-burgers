import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import { requireRoles } from '@/lib/auth/require-roles';
import { getExchangeRates, updateExchangeRates } from '@/lib/db/exchange-rates';
import type { UserRole } from '@/lib/db/types';

const READ_ROLES: UserRole[] = ['admin', 'cajero'];

function parseRate(value: unknown, label: string): number | null {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return rate;
}

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, READ_ROLES);
  if (auth instanceof Response) return auth;

  const rates = await getExchangeRates();
  return Response.json({ rates });
};

export const PATCH: APIRoute = async (context) => {
  const session = requireAdmin(context);
  if (session instanceof Response) return session;

  let body: { usd_rate?: number; bs_rate?: number };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const usdRate = parseRate(body.usd_rate, 'USD');
  const bsRate = parseRate(body.bs_rate, 'BS');

  if (usdRate === null) {
    return Response.json({ error: 'La tasa USD debe ser un número mayor a 0' }, { status: 400 });
  }

  if (bsRate === null) {
    return Response.json({ error: 'La tasa BS debe ser un número mayor a 0' }, { status: 400 });
  }

  const rates = await updateExchangeRates({
    usd_rate: usdRate,
    bs_rate: bsRate,
    updated_by: session.userId,
  });

  return Response.json({ rates });
};
