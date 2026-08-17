import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, setupTestDatabase, teardownTestDatabase } from '@/test/db';
import { createId } from '@/lib/utils/id';

describe('adicionales en ítems de comanda', () => {
  let userId = '';
  let tableId = '';
  let burgerId = '';
  let extraId = '';

  beforeAll(async () => {
    await setupTestDatabase();

    const { getDb } = await import('@/lib/db/client');
    const db = getDb();

    userId = await createTestUser(db, 'admin-extras', 'extras-pass', 'admin');

    tableId = createId();
    await db.execute({
      sql: `INSERT INTO tables (id, number, capacity, status) VALUES (?, '2', 4, 'libre')`,
      args: [tableId],
    });

    burgerId = createId();
    extraId = createId();

    await db.execute({
      sql: `
        INSERT INTO products (id, name, price, category, active)
        VALUES (?, 'Hamburguesa clásica', 25000, 'clasicas', 1)
      `,
      args: [burgerId],
    });
    await db.execute({
      sql: `
        INSERT INTO products (id, name, price, category, active)
        VALUES (?, 'Adicional de salchicha', 3000, 'adicionales', 1)
      `,
      args: [extraId],
    });
  });

  afterAll(async () => {
    const { resetDbClient } = await import('@/lib/db/client');
    resetDbClient();
    teardownTestDatabase();
  });

  it('suma el adicional al precio del producto y lo deja referenciado', async () => {
    const { createOrderForTable, addOrderItem, getOrderById, listOrderItems } =
      await import('@/lib/db/orders');

    const order = await createOrderForTable(tableId, userId);
    const item = await addOrderItem(
      order.id,
      {
        productId: burgerId,
        quantity: 1,
        notes: 'Sin pan',
        adicionalIds: [extraId],
      },
      userId,
    );

    expect(item.price_at_sale).toBe(28000);
    expect(item.notes).toBe('Sin pan');
    expect(item.extras).toEqual([
      { product_id: extraId, name: 'Adicional de salchicha', price: 3000 },
    ]);

    const updated = await getOrderById(order.id);
    expect(updated?.total).toBe(28000);

    const items = await listOrderItems(order.id);
    expect(items[0]?.extras[0]?.name).toBe('Adicional de salchicha');
  });
});
