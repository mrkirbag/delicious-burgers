import type { APIContext } from 'astro';

import type { Session } from './session';

export function requireAdmin(context: Pick<APIContext, 'locals'>): Session | Response {
  const session = context.locals.session;

  if (!session) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return Response.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  return session;
}
