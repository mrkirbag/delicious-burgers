import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, setupTestDatabase, teardownTestDatabase } from '@/test/db';
import { createId } from '@/lib/utils/id';

describe('operational smoke flow', () => {
  let userId = '';
  let tableId = '';
  let productId = '';
  let cashRegisterId = '';
  let orderId = '';

  beforeAll(async () => {
    await setupTestDatabase();

    const { getDb } = await import('@/lib/db/client');
    const db = getDb();

    userId = await createTestUser(db, 'admin-smoke', 'smoke-pass', 'admin');

    tableId = createId();
    await db.execute({
      sql: `INSERT INTO tables (id, number, capacity, status) VALUES (?, '1', 4, 'libre')`,
      args: [tableId],
    });

    productId = createId();
    await db.execute({
      sql: `
        INSERT INTO products (id, name, price, category, active)
        VALUES (?, 'Hamburguesa clásica', 25000, 'clasicas', 1)
      `,
      args: [productId],
    });

    const { openCashRegister } = await import('@/lib/db/cash-registers');
    const register = await openCashRegister(userId, 100_000, 50);
    cashRegisterId = register.id;
  });

  afterAll(async () => {
    const { resetDbClient } = await import('@/lib/db/client');
    resetDbClient();
    teardownTestDatabase();
  });

  it('crea una comanda de mesa y agrega un producto', async () => {
    const { createOrderForTable, addOrderItem, getOrderById } = await import('@/lib/db/orders');

    const order = await createOrderForTable(tableId, userId);
    orderId = order.id;

    await addOrderItem(
      orderId,
      {
        productId,
        quantity: 2,
      },
      userId,
    );

    const updated = await getOrderById(orderId);
    expect(updated?.status).toBe('pendiente');
    expect(updated?.total).toBe(50_000);
  });

  it('al cobrar envía automáticamente a cocina', async () => {
    const { payOrder, getOrderById } = await import('@/lib/db/orders');
    const { getTableById } = await import('@/lib/db/tables');

    const paid = await payOrder(orderId, cashRegisterId, [
      {
        payment_method: 'efectivo',
        amount_cop: 50_000,
        foreign_currency: null,
        foreign_amount: null,
      },
    ]);

    expect(paid.status).toBe('cocina');
    expect(paid.cash_register_id).toBe(cashRegisterId);

    const updated = await getOrderById(orderId);
    expect(updated?.status).toBe('cocina');

    const table = await getTableById(tableId);
    expect(table?.status).toBe('ocupada');
  });

  it('al marcar listo queda entregado y la mesa pasa a limpieza', async () => {
    const { markOrderReady, getOrderById } = await import('@/lib/db/orders');
    const { getTableById } = await import('@/lib/db/tables');

    await markOrderReady(orderId);
    expect((await getOrderById(orderId))?.status).toBe('entregado');

    const table = await getTableById(tableId);
    expect(table?.status).toBe('limpieza');
  });

  it('cierra la caja del turno', async () => {
    const { closeCashRegister, getCashRegisterById } = await import('@/lib/db/cash-registers');

    const closed = await closeCashRegister(cashRegisterId, userId, 150_000, 50);
    expect(closed.status).toBe('closed');

    const register = await getCashRegisterById(cashRegisterId);
    expect(register?.status).toBe('closed');
    expect(register?.actual_balance).toBe(150_000);
    expect(register?.total_sales).toBe(50_000);
  });
});
