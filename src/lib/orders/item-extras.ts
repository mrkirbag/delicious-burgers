import type { OrderItemExtra } from '@/lib/db/types';

export const ADICIONALES_CATEGORY = 'adicionales';

export function productUsesAdicionales(category: string): boolean {
  return category !== 'bebidas' && category !== ADICIONALES_CATEGORY;
}

export function isValidOrderItemExtra(value: unknown): value is OrderItemExtra {
  if (!value || typeof value !== 'object') return false;

  const extra = value as Record<string, unknown>;
  return (
    typeof extra.product_id === 'string' &&
    extra.product_id.length > 0 &&
    typeof extra.name === 'string' &&
    extra.name.length > 0 &&
    typeof extra.price === 'number' &&
    Number.isFinite(extra.price)
  );
}

export function parseOrderItemExtras(value: unknown): OrderItemExtra[] {
  if (!value) return [];

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidOrderItemExtra);
}

export function sumExtrasPrice(extras: OrderItemExtra[]): number {
  return extras.reduce((total, extra) => total + extra.price, 0);
}

export function formatExtraLine(extra: OrderItemExtra): string {
  return `+ ${extra.name}`;
}
