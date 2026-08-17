import { describe, expect, it } from 'vitest';

import {
  formatExtraLine,
  parseOrderItemExtras,
  productUsesAdicionales,
  sumExtrasPrice,
} from '@/lib/orders/item-extras';
import {
  ITEM_NOTE_OPTIONS,
  buildItemNotes,
  getItemPreferenceLabel,
} from '@/lib/orders/item-preferences';

describe('item extras', () => {
  it('parsea adicionales guardados en JSON', () => {
    const extras = parseOrderItemExtras(
      JSON.stringify([{ product_id: '1', name: 'Adicional de salchicha', price: 3000 }]),
    );

    expect(extras).toEqual([{ product_id: '1', name: 'Adicional de salchicha', price: 3000 }]);
    expect(sumExtrasPrice(extras)).toBe(3000);
    expect(formatExtraLine(extras[0])).toBe('+ Adicional de salchicha');
  });

  it('no admite adicionales en bebidas ni en la categoría adicionales', () => {
    expect(productUsesAdicionales('clasicas')).toBe(true);
    expect(productUsesAdicionales('bebidas')).toBe(false);
    expect(productUsesAdicionales('adicionales')).toBe(false);
  });
});

describe('item preferences', () => {
  it('incluye sin pan y sin salchicha', () => {
    expect(ITEM_NOTE_OPTIONS).toContain('Sin pan');
    expect(ITEM_NOTE_OPTIONS).toContain('Sin salchicha');
  });

  it('arma notas con corte obligatorio y por defecto enteras', () => {
    expect(buildItemNotes('Enteras', ['Con todo'])).toBe('Enteras, Con todo');
    expect(buildItemNotes('Picadas', ['Sin pan'])).toBe('Picadas, Sin pan');
    expect(getItemPreferenceLabel({ notes: null, product_category: 'clasicas' })).toBe(
      'Enteras, Con todo',
    );
    expect(getItemPreferenceLabel({ notes: 'Sin queso', product_category: 'clasicas' })).toBe(
      'Enteras, Sin queso',
    );
    expect(getItemPreferenceLabel({ notes: 'Picadas, Sin pan', product_category: 'bebidas' })).toBe(
      null,
    );
  });
});
