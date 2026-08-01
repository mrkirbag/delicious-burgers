import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { getPaidOrderDetail } from '@/lib/db/orders';
import type { UserRole } from '@/lib/db/types';

const INVOICE_ROLES: UserRole[] = ['admin', 'cajero'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, INVOICE_ROLES);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const detail = await getPaidOrderDetail(id);
  if (!detail) {
    return Response.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  return Response.json(detail);
};
