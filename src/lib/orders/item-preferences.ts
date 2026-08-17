/** Preferencias de preparación en ítems de comanda (hamburguesas, etc.). */

export const DEFAULT_ITEM_PREFERENCE = 'Con todo';

export const DEFAULT_ITEM_CUT_STYLE = 'Enteras';

export const ITEM_CUT_STYLES = ['Enteras', 'Picadas'] as const;

export type ItemCutStyle = (typeof ITEM_CUT_STYLES)[number];

export const ITEM_NOTE_OPTIONS = [
  DEFAULT_ITEM_PREFERENCE,
  'Sin pan',
  'Sin salchicha',
  'Sin vegetales',
  'Sin cebolla',
  'Sin lechuga',
  'Sin tomate',
  'Sin pepinillos',
  'Sin salsa',
  'Sin queso',
  'Sin tocineta',
] as const;

export function productUsesPreferences(category: string): boolean {
  return category !== 'bebidas';
}

export function productUsesCutStyle(category: string): boolean {
  return productUsesPreferences(category);
}

export function isItemCutStyle(value: string): value is ItemCutStyle {
  return ITEM_CUT_STYLES.includes(value as ItemCutStyle);
}

export function buildItemNotes(cutStyle: ItemCutStyle, noteOptions: string[]): string {
  const preferences = noteOptions.map((option) => option.trim()).filter(Boolean);
  return [cutStyle, ...preferences].join(', ');
}

/** Texto de preferencias para tickets/comanda. Bebidas no llevan. Incluye enteras/picadas. */
export function getItemPreferenceLabel(item: {
  notes?: string | null;
  product_category?: string | null;
}): string | null {
  if (item.product_category && !productUsesPreferences(item.product_category)) {
    return null;
  }

  const parts = item.notes
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean) ?? [];

  if (parts.length === 0) {
    return `${DEFAULT_ITEM_CUT_STYLE}, ${DEFAULT_ITEM_PREFERENCE}`;
  }

  if (!parts.some((part) => isItemCutStyle(part))) {
    return [DEFAULT_ITEM_CUT_STYLE, ...parts].join(', ');
  }

  return parts.join(', ');
}
