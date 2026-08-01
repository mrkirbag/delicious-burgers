import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { listActiveMenuProducts } from '@/lib/db/products';
import type { UserRole } from '@/lib/db/types';

const ORDER_ROLES: UserRole[] = ['admin', 'cajero', 'mesero'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, ORDER_ROLES);
  if (auth instanceof Response) return auth;

  const products = await listActiveMenuProducts();
  return Response.json({ products });
};
