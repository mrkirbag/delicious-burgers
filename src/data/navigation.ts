import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BarChart3,
  Bike,
  ChefHat,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LineChart,
  Receipt,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Warehouse,
} from 'lucide-react';

import type { UserRole } from '@/lib/db/types';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  comingSoon?: boolean;
};

export type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /** Muestra un separador visual antes de esta sección en el menú lateral. */
  dividerBefore?: boolean;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    id: 'principal',
    label: 'Principal',
    icon: LayoutDashboard,
    roles: ['admin', 'cajero', 'mesero'],
    items: [
      {
        label: 'Panel Principal',
        href: '/panel',
        icon: LayoutDashboard,
        description: 'Vista general de mesas, domicilios y comandas del local.',
      },
    ],
  },
  {
    id: 'comandas',
    label: 'Comandas',
    icon: ClipboardList,
    roles: ['admin', 'cajero', 'mesero'],
    items: [
      {
        label: 'Mesas',
        href: '/panel/mesas',
        icon: UtensilsCrossed,
        description: 'Gestiona el estado de las mesas del local.',
      },
      {
        label: 'Domicilios',
        href: '/panel/domicilios',
        icon: Bike,
        description: 'Crea y gestiona pedidos a domicilio.',
      },
      {
        label: 'Comandas',
        href: '/panel/comandas',
        icon: ClipboardList,
        description: 'Crea y revisa pedidos en curso.',
      },
    ],
  },
  {
    id: 'cocina',
    label: 'Cocina',
    icon: ChefHat,
    dividerBefore: true,
    roles: ['admin', 'cocina'],
    items: [
      {
        label: 'Cocina',
        href: '/panel/cocina',
        icon: ChefHat,
        description: 'Pedidos pendientes de preparación.',
      },
    ],
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    icon: Receipt,
    dividerBefore: true,
    roles: ['admin', 'cajero'],
    items: [
      {
        label: 'Caja',
        href: '/panel/caja',
        icon: Receipt,
        description: 'Abre y cierra la caja, factura y cobra pedidos.',
      },
      {
        label: 'Facturas',
        href: '/panel/facturas',
        icon: Receipt,
        description: 'Consulta el historial de facturas emitidas.',
      },
    ],
  },
  {
    id: 'productos',
    label: 'Productos',
    icon: ShoppingBag,
    dividerBefore: true,
    roles: ['admin'],
    items: [
      {
        label: 'Catálogo',
        href: '/panel/productos',
        icon: ShoppingBag,
        description: 'Menú del local: entradas, clásicas, combos, bebidas y más.',
      },
      {
        label: 'Inventario',
        href: '/panel/inventario',
        icon: Warehouse,
        description: 'Insumos con control manual: cajas, bolsas, unidades.',
      },
    ],
  },
  {
    id: 'flujo-caja',
    label: 'Flujo de caja',
    icon: ArrowLeftRight,
    dividerBefore: true,
    roles: ['admin'],
    items: [
      {
        label: 'Flujo de caja',
        href: '/panel/flujo',
        icon: ArrowLeftRight,
      },
    ],
  },
  {
    id: 'estadisticas-reportes',
    label: 'Estadísticas y reportes',
    icon: BarChart3,
    roles: ['admin'],
    items: [
      {
        label: 'Reportes',
        href: '/panel/reportes',
        icon: LineChart,
      },
    ],
  },
  {
    id: 'config',
    label: 'Configuración',
    icon: Users,
    dividerBefore: true,
    roles: ['admin'],
    items: [
      {
        label: 'Usuarios',
        href: '/panel/usuarios',
        icon: Users,
        description: 'Gestiona cuentas y roles del personal.',
      },
      {
        label: 'Tasas de cambio',
        href: '/panel/tasas',
        icon: Coins,
        description: 'Configura las tasas de cambio del sistema.',
      },
    ],
  },
];

function isSectionVisibleForRole(section: NavSection, role: UserRole): boolean {
  return !section.roles || section.roles.includes(role);
}

export function getNavSectionsForRole(role: UserRole): NavSection[] {
  return navSections
    .filter((section) => isSectionVisibleForRole(section, role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.comingSoon),
    }))
    .filter((section) => section.items.length > 0);
}

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return getNavSectionsForRole(role).flatMap((section) => section.items);
}

export function getQuickAccessItemsForRole(role: UserRole): NavItem[] {
  return getNavItemsForRole(role).filter((item) => item.href !== '/panel');
}

export function isNavItemActive(href: string, currentPath: string): boolean {
  if (href === '/panel') {
    return currentPath === '/panel' || currentPath === '/panel/';
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function isNavSectionActive(section: NavSection, currentPath: string): boolean {
  return section.items.some((item) => isNavItemActive(item.href, currentPath));
}

export function getNavItemByPath(pathname: string): NavItem | undefined {
  const normalized = pathname.replace(/\/$/, '') || '/panel';
  const allItems = navSections.flatMap((section) => section.items);
  return allItems.find((item) => item.href === normalized);
}
