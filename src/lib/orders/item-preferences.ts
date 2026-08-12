/** Preferencias de preparación en ítems de comanda (hamburguesas, etc.). */

export const DEFAULT_ITEM_PREFERENCE = 'Con todo';

export function productUsesPreferences(category: string): boolean {
  return category !== 'bebidas';
}

/** Texto de preferencias para tickets/comanda. Bebidas no llevan. Si falta nota, usa "Con todo". */
export function getItemPreferenceLabel(item: {
  notes?: string | null;
  product_category?: string | null;
}): string | null {
  if (item.product_category && !productUsesPreferences(item.product_category)) {
    return null;
  }

  const notes = item.notes?.trim();
  return notes || DEFAULT_ITEM_PREFERENCE;
}
