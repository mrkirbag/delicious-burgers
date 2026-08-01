import type { APIRoute } from 'astro';

import { requireRoles } from '@/lib/auth/require-roles';
import { getSalesReport } from '@/lib/db/reports';
import type { UserRole } from '@/lib/db/types';

const REPORT_ROLES: UserRole[] = ['admin'];

export const GET: APIRoute = async (context) => {
  const auth = requireRoles(context, REPORT_ROLES);
  if (auth instanceof Response) return auth;

  const { searchParams } = context.url;
  const dateFrom = searchParams.get('date_from') ?? undefined;
  const dateTo = searchParams.get('date_to') ?? undefined;

  const report = await getSalesReport({ dateFrom, dateTo });
  return Response.json({ report });
};
