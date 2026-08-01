import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { listKitchenOrders } from '@/lib/db/orders';
import type { UserRole } from '@/lib/db/types';

const KITCHEN_ROLES: UserRole[] = ['admin', 'cocina'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, KITCHEN_ROLES);
  if (auth instanceof Response) return auth;

  const orders = await listKitchenOrders();
  return Response.json({ orders });
};
