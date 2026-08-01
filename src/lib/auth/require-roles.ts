import type { APIContext } from 'astro';

import type { UserRole } from '@/lib/db/types';

import type { Session } from './session';

export function requireRoles(
  context: Pick<APIContext, 'locals'>,
  roles: UserRole[],
): Session | Response {
  const session = context.locals.session;

  if (!session) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (!roles.includes(session.role)) {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  return session;
}
