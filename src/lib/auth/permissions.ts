import { getNavItemsForRole } from '@/data/navigation';
import type { UserRole } from '@/lib/db/types';

const defaultRoutes: Record<UserRole, string> = {
  admin: '/panel',
  mesero: '/panel/comandas',
  cajero: '/panel/caja',
  cocina: '/panel/cocina',
};

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/$/, '');
  return path || '/panel';
}

export function getDefaultRouteForRole(role: UserRole): string {
  return defaultRoutes[role];
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const normalized = normalizePath(pathname);
  const allowedItems = getNavItemsForRole(role);

  return allowedItems.some((item) => {
    if (item.href === '/panel') {
      return normalized === '/panel';
    }
    return normalized === item.href || normalized.startsWith(`${item.href}/`);
  });
}
