import { defineMiddleware } from 'astro:middleware';

import { canAccessRoute, getDefaultRouteForRole, getSession } from '@/lib/auth';
import { ensureMigrations } from '@/lib/db/init';

const PROTECTED_PREFIX = '/panel';
const AUTH_PATHS = new Set(['/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith(PROTECTED_PREFIX) || pathname.startsWith('/api/')) {
    await ensureMigrations();
  }

  const session = await getSession(context.cookies);

  if (pathname.startsWith(PROTECTED_PREFIX) && !session) {
    return context.redirect('/login');
  }

  if (session && pathname.startsWith(PROTECTED_PREFIX) && !canAccessRoute(session.role, pathname)) {
    return context.redirect(getDefaultRouteForRole(session.role));
  }

  if (
    session?.role === 'cocina' &&
    (pathname === '/panel' || pathname === '/panel/')
  ) {
    return context.redirect('/panel/cocina');
  }

  if (AUTH_PATHS.has(pathname) && session) {
    return context.redirect(getDefaultRouteForRole(session.role));
  }

  if (pathname === '/' && session) {
    return context.redirect(getDefaultRouteForRole(session.role));
  }

  if (pathname === '/' && !session) {
    return context.redirect('/login');
  }

  context.locals.session = session;

  return next();
});
