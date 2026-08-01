import type { OrderStatus } from '@/lib/db/types';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  cocina: 'En cocina',
  listo: 'Listo',
  entregado: 'Entregado',
  pagado: 'Pagado',
  cancelado: 'Cancelado',
};

export const ACTIVE_ORDER_FILTER_OPTIONS = [
  { id: 'all' as const, label: 'Todas activas' },
  { id: 'pendiente' as const, label: 'Pendiente' },
  { id: 'cocina' as const, label: 'En cocina' },
  { id: 'listo' as const, label: 'Listo' },
  { id: 'entregado' as const, label: 'Entregado' },
];

export const DELIVERY_FILTER_OPTIONS = [
  { id: 'all' as const, label: 'Todos' },
  { id: 'pendiente' as const, label: 'Pendiente' },
  { id: 'cocina' as const, label: 'En cocina' },
  { id: 'listo' as const, label: 'Listo' },
  { id: 'entregado' as const, label: 'Entregado' },
];
