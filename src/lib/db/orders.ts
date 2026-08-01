import {
  canMarkOrderDelivered,
  canPayOrder,
  canSendOrderToKitchen,
  getDeliveryPaymentTiming,
  type DeliveryPaymentTiming,
} from '@/lib/orders/delivery-flow';
import { resolveInventoryDeduction, type InventoryDeduction } from '@/lib/inventory/menu-inventory';
import { createId } from '@/lib/utils/id';

import { db } from './client';
import {
  deductInventoryForOrder,
  getInventoryItemById,
  restoreInventoryForOrder,
} from './inventory';
import { getActiveMenuProductById, getMenuProductInventoryLink } from './products';
import { countActiveOrdersForTable, getTableById } from './tables';
import { assertCashRegisterOpen } from './cash-registers';
import { getExchangeRates } from './exchange-rates';
import { createOrderPayments, listOrderPayments, listPaymentsForOrderIds } from './order-payments';
import type { SqlArgs, SqlStatement } from './sql';
import type {
  Order,
  OrderItem,
  OrderPayment,
  OrderPaymentInput,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ForeignCurrency,
} from './types';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pendiente', 'cocina', 'listo', 'entregado'];

const ORDER_COLUMNS = `
  id, table_id, order_type, delivery_payment_timing, user_id, cash_register_id, status, total,
  payment_method, foreign_currency, foreign_amount,
  customer_name, customer_phone, delivery_address, delivery_notes,
  created_at, updated_at
`;

const ORDER_LIST_COLUMNS = `
  o.id,
  o.table_id,
  o.order_type,
  o.delivery_payment_timing,
  o.user_id,
  o.cash_register_id,
  o.status,
  o.total,
  o.payment_method,
  o.foreign_currency,
  o.foreign_amount,
  o.customer_name,
  o.customer_phone,
  o.delivery_address,
  o.delivery_notes,
  o.created_at,
  o.updated_at
`;

export type OrderItemWithProduct = OrderItem & {
  product_name: string;
  product_category: string;
};

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    table_id: row.table_id ? String(row.table_id) : null,
    order_type: (row.order_type as OrderType) ?? 'mesa',
    delivery_payment_timing: row.delivery_payment_timing
      ? (row.delivery_payment_timing as DeliveryPaymentTiming)
      : null,
    user_id: String(row.user_id),
    cash_register_id: row.cash_register_id ? String(row.cash_register_id) : null,
    status: row.status as OrderStatus,
    total: Number(row.total),
    payment_method: row.payment_method as Order['payment_method'],
    foreign_currency: row.foreign_currency
      ? (row.foreign_currency as ForeignCurrency)
      : null,
    foreign_amount: row.foreign_amount != null ? Number(row.foreign_amount) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    delivery_address: row.delivery_address ? String(row.delivery_address) : null,
    delivery_notes: row.delivery_notes ? String(row.delivery_notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapOrderItem(row: Record<string, unknown>): OrderItemWithProduct {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    product_id: String(row.product_id),
    quantity: Number(row.quantity),
    notes: row.notes ? String(row.notes) : null,
    price_at_sale: Number(row.price_at_sale),
    product_name: String(row.product_name),
    product_category: String(row.product_category),
  };
}

export async function getOrderById(id: string): Promise<Order | null> {
  const result = await db.execute({
    sql: `
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE id = ?
      LIMIT 1
    `,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return mapOrder(result.rows[0] as Record<string, unknown>);
}

export async function getActiveOrderByTableId(tableId: string): Promise<Order | null> {
  const result = await db.execute({
    sql: `
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE table_id = ?
        AND status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(', ')})
      ORDER BY created_at DESC
      LIMIT 1
    `,
    args: [tableId, ...ACTIVE_ORDER_STATUSES],
  });

  if (result.rows.length === 0) return null;
  return mapOrder(result.rows[0] as Record<string, unknown>);
}

export async function listOrderItems(orderId: string): Promise<OrderItemWithProduct[]> {
  const result = await db.execute({
    sql: `
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.notes,
        oi.price_at_sale,
        p.name AS product_name,
        p.category AS product_category
      FROM order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.rowid ASC
    `,
    args: [orderId],
  });

  return result.rows.map((row) => mapOrderItem(row as Record<string, unknown>));
}

async function getInventoryDeductionForMenuProduct(
  menuProductId: string,
  orderItemQuantity: number,
): Promise<InventoryDeduction | null> {
  const link = await getMenuProductInventoryLink(menuProductId);
  if (!link) return null;
  return resolveInventoryDeduction(menuProductId, link, orderItemQuantity);
}

async function validateInventoryDeduction(deduction: InventoryDeduction | null): Promise<void> {
  if (!deduction) return;

  const inventory = await getInventoryItemById(deduction.productId);
  if (!inventory) {
    throw new Error('Producto sin registro de inventario');
  }

  if (inventory.stock < deduction.quantity) {
    throw new Error(`Stock insuficiente de ${inventory.name}`);
  }
}

async function recalculateOrderTotal(orderId: string): Promise<number> {
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      UPDATE orders
      SET
        total = (
          SELECT COALESCE(SUM(quantity * price_at_sale), 0)
          FROM order_items
          WHERE order_id = ?
        ),
        updated_at = ?
      WHERE id = ?
    `,
    args: [orderId, now, orderId],
  });

  const order = await getOrderById(orderId);
  return order?.total ?? 0;
}

async function assertOrderEditable(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (order.status !== 'pendiente') {
    throw new Error('La comanda ya no se puede editar');
  }

  return order;
}

async function getOrderItemById(itemId: string): Promise<OrderItemWithProduct | null> {
  const result = await db.execute({
    sql: `
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.notes,
        oi.price_at_sale,
        p.name AS product_name,
        p.category AS product_category
      FROM order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      WHERE oi.id = ?
      LIMIT 1
    `,
    args: [itemId],
  });

  if (result.rows.length === 0) return null;
  return mapOrderItem(result.rows[0] as Record<string, unknown>);
}

async function validateInventoryForProduct(
  productId: string,
  requiresInventory: boolean,
  quantity: number,
  inventoryProductId?: string | null,
  inventoryUnitsPerSale?: number,
): Promise<void> {
  const deduction = resolveInventoryDeduction(
    productId,
    {
      requires_inventory: requiresInventory,
      inventory_product_id: inventoryProductId ?? null,
      inventory_units_per_sale: inventoryUnitsPerSale ?? 1,
    },
    quantity,
  );

  await validateInventoryDeduction(deduction);
}

export async function createOrderForTable(tableId: string, userId: string): Promise<Order> {
  const table = await getTableById(tableId);

  if (!table) {
    throw new Error('Mesa no encontrada');
  }

  if (table.status !== 'libre') {
    throw new Error('La mesa no está libre');
  }

  const existing = await getActiveOrderByTableId(tableId);
  if (existing) {
    throw new Error('La mesa ya tiene una comanda activa');
  }

  const orderId = createId();
  const now = new Date().toISOString();

  await db.batch([
    {
      sql: `
        INSERT INTO orders (id, table_id, order_type, user_id, status, total, created_at, updated_at)
        VALUES (?, ?, 'mesa', ?, 'pendiente', 0, ?, ?)
      `,
      args: [orderId, tableId, userId, now, now],
    },
    {
      sql: `UPDATE tables SET status = 'ocupada' WHERE id = ?`,
      args: [tableId],
    },
  ]);

  const order = await getOrderById(orderId);
  if (!order) throw new Error('No se pudo crear la comanda');
  return order;
}

export type CreateDeliveryOrderInput = {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes?: string;
  delivery_payment_timing?: DeliveryPaymentTiming;
};

export async function createDeliveryOrder(
  userId: string,
  input: CreateDeliveryOrderInput,
): Promise<Order> {
  const customerName = input.customer_name.trim();
  const customerPhone = input.customer_phone.trim();
  const deliveryAddress = input.delivery_address.trim();
  const deliveryNotes = input.delivery_notes?.trim() || null;
  const paymentTiming = input.delivery_payment_timing ?? 'on_delivery';

  if (customerName.length < 2) {
    throw new Error('El nombre del cliente es requerido');
  }

  if (customerPhone.length < 7) {
    throw new Error('El teléfono del cliente es requerido');
  }

  if (deliveryAddress.length < 5) {
    throw new Error('La dirección de entrega es requerida');
  }

  const orderId = createId();
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO orders (
        id, table_id, order_type, delivery_payment_timing, user_id, status, total,
        customer_name, customer_phone, delivery_address, delivery_notes,
        created_at, updated_at
      )
      VALUES (?, NULL, 'delivery', ?, ?, 'pendiente', 0, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      orderId,
      paymentTiming,
      userId,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryNotes,
      now,
      now,
    ],
  });

  const order = await getOrderById(orderId);
  if (!order) throw new Error('No se pudo crear el domicilio');
  return order;
}

type AddOrderItemInput = {
  productId: string;
  quantity: number;
  notes?: string;
};

export async function addOrderItem(
  orderId: string,
  input: AddOrderItemInput,
  userId: string,
): Promise<OrderItemWithProduct> {
  const order = await assertOrderEditable(orderId);

  const product = await getActiveMenuProductById(input.productId);
  if (!product) {
    throw new Error('Producto no disponible en el catálogo');
  }

  const quantity = input.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Cantidad inválida');
  }

  await validateInventoryForProduct(
    product.id,
    product.requires_inventory,
    quantity,
    product.inventory_product_id,
    product.inventory_units_per_sale,
  );

  const itemId = createId();
  const notes = input.notes?.trim() || null;

  await db.execute({
    sql: `
      INSERT INTO order_items (id, order_id, product_id, quantity, notes, price_at_sale)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [itemId, orderId, product.id, quantity, notes, product.price],
  });

  const deduction = resolveInventoryDeduction(
    product.id,
    {
      requires_inventory: product.requires_inventory,
      inventory_product_id: product.inventory_product_id ?? null,
      inventory_units_per_sale: product.inventory_units_per_sale ?? 1,
    },
    quantity,
  );

  try {
    if (deduction) {
      await deductInventoryForOrder(deduction.productId, deduction.quantity, userId, order.id);
    }
  } catch (error) {
    await db.execute({
      sql: 'DELETE FROM order_items WHERE id = ?',
      args: [itemId],
    });
    throw error;
  }

  await recalculateOrderTotal(orderId);

  const item = await getOrderItemById(itemId);
  if (!item) throw new Error('No se pudo agregar el ítem');
  return item;
}

type UpdateOrderItemInput = {
  quantity?: number;
  notes?: string;
};

export async function updateOrderItem(
  itemId: string,
  input: UpdateOrderItemInput,
  userId: string,
): Promise<OrderItemWithProduct | null> {
  const existing = await getOrderItemById(itemId);
  if (!existing) return null;

  await assertOrderEditable(existing.order_id);

  const link = await getMenuProductInventoryLink(existing.product_id);
  if (!link) {
    throw new Error('Producto no encontrado');
  }

  const fields: string[] = [];
  const args: SqlArgs = [];

  if (input.notes !== undefined) {
    fields.push('notes = ?');
    args.push(input.notes.trim() || null);
  }

  if (input.quantity !== undefined) {
    const newQuantity = input.quantity;
    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      throw new Error('Cantidad inválida');
    }

    const previousDeduction = resolveInventoryDeduction(
      existing.product_id,
      link,
      existing.quantity,
    );
    const nextDeduction = resolveInventoryDeduction(existing.product_id, link, newQuantity);

    if (previousDeduction && nextDeduction) {
      if (previousDeduction.productId !== nextDeduction.productId) {
        throw new Error('No se pudo ajustar el inventario del producto');
      }

      const delta = nextDeduction.quantity - previousDeduction.quantity;
      if (delta > 0) {
        await validateInventoryDeduction({ ...nextDeduction, quantity: delta });
        await deductInventoryForOrder(
          nextDeduction.productId,
          delta,
          userId,
          existing.order_id,
        );
      } else if (delta < 0) {
        await restoreInventoryForOrder(
          nextDeduction.productId,
          -delta,
          userId,
          existing.order_id,
        );
      }
    }

    fields.push('quantity = ?');
    args.push(newQuantity);
  }

  if (fields.length === 0) {
    return existing;
  }

  await db.execute({
    sql: `UPDATE order_items SET ${fields.join(', ')} WHERE id = ?`,
    args: [...args, itemId],
  });

  await recalculateOrderTotal(existing.order_id);

  return getOrderItemById(itemId);
}

export async function removeOrderItem(itemId: string, userId: string): Promise<boolean> {
  const existing = await getOrderItemById(itemId);
  if (!existing) return false;

  await assertOrderEditable(existing.order_id);

  const deduction = await getInventoryDeductionForMenuProduct(
    existing.product_id,
    existing.quantity,
  );

  if (deduction) {
    await restoreInventoryForOrder(
      deduction.productId,
      deduction.quantity,
      userId,
      existing.order_id,
    );
  }

  const result = await db.execute({
    sql: 'DELETE FROM order_items WHERE id = ?',
    args: [itemId],
  });

  if (result.rowsAffected === 0) return false;

  await recalculateOrderTotal(existing.order_id);
  return true;
}

export async function sendOrderToKitchen(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (!canSendOrderToKitchen(order)) {
    if (order.order_type === 'delivery' && order.delivery_payment_timing === 'prepaid') {
      throw new Error('Los domicilios con pago anticipado deben cobrarse antes de enviarse a cocina');
    }

    throw new Error('La comanda ya fue enviada a cocina o no está lista para enviarse');
  }

  const items = await listOrderItems(orderId);
  if (items.length === 0) {
    throw new Error('Agrega al menos un producto antes de enviar a cocina');
  }

  return updateOrderStatus(orderId, 'cocina');
}

export async function markOrderReady(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (order.status !== 'cocina') {
    throw new Error('La comanda no está en cocina');
  }

  const autoDeliver = order.order_type === 'mesa';

  if (autoDeliver) {
    return updateOrderStatus(orderId, 'entregado');
  }

  return updateOrderStatus(orderId, 'listo');
}

export async function markOrderDelivered(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (!canMarkOrderDelivered(order)) {
    if (
      order.order_type === 'delivery' &&
      order.delivery_payment_timing === 'on_delivery' &&
      order.status === 'listo'
    ) {
      throw new Error('Debes facturar y cobrar el domicilio antes de marcarlo como entregado');
    }

    throw new Error('La comanda no está lista para entregar');
  }

  return updateOrderStatus(orderId, 'entregado');
}

export async function cancelOrder(orderId: string, userId: string): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (order.status !== 'pendiente') {
    throw new Error('Solo se pueden cancelar comandas que no se han enviado a cocina');
  }

  const items = await listOrderItems(orderId);

  for (const item of items) {
    const deduction = await getInventoryDeductionForMenuProduct(item.product_id, item.quantity);
    if (deduction) {
      await restoreInventoryForOrder(
        deduction.productId,
        deduction.quantity,
        userId,
        orderId,
      );
    }
  }

  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE orders SET status = 'cancelado', updated_at = ? WHERE id = ?`,
    args: [now, orderId],
  });

  const activeCount = order.table_id ? await countActiveOrdersForTable(order.table_id) : 0;
  if (order.table_id && activeCount === 0) {
    await db.execute({
      sql: `UPDATE tables SET status = 'libre' WHERE id = ?`,
      args: [order.table_id],
    });
  }

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('No se pudo cancelar la comanda');
  return updated;
}

async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
    args: [status, now, orderId],
  });

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('No se pudo actualizar la comanda');
  return updated;
}

export type KitchenOrder = OrderListItem & {
  items: OrderItemWithProduct[];
};

export async function listKitchenOrders(): Promise<KitchenOrder[]> {
  const result = await db.execute({
    sql: `
      SELECT
        ${ORDER_LIST_COLUMNS},
        t.number AS table_number,
        u.username,
        (
          SELECT COUNT(*)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) AS item_count
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      INNER JOIN users u ON u.id = o.user_id
      WHERE o.status = 'cocina'
      ORDER BY o.updated_at ASC
    `,
    args: [],
  });

  const orders = result.rows.map((row) => mapOrderListItem(row as Record<string, unknown>));

  return Promise.all(
    orders.map(async (order) => ({
      ...order,
      items: await listOrderItems(order.id),
    })),
  );
}

export type OrderListItem = Order & {
  table_number: string | null;
  username: string;
  item_count: number;
};

function mapOrderListItem(row: Record<string, unknown>): OrderListItem {
  return {
    ...mapOrder(row),
    table_number: row.table_number != null ? String(row.table_number) : null,
    username: String(row.username),
    item_count: Number(row.item_count),
  };
}

export async function listActiveOrders(
  status?: OrderStatus,
  orderType?: OrderType,
): Promise<OrderListItem[]> {
  const statuses = status ? [status] : null;
  const conditions: string[] = [
    `o.status != 'cancelado'`,
    `NOT (o.status = 'pagado' AND o.order_type = 'mesa')`,
    `NOT (o.status = 'entregado' AND o.order_type = 'delivery')`,
  ];
  const args: SqlArgs = [];

  if (statuses) {
    conditions.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
    args.push(...statuses);
  } else {
    conditions.push(`(
      o.status IN ('pendiente', 'cocina', 'listo', 'entregado')
      OR (o.status = 'pagado' AND o.order_type = 'delivery')
    )`);
  }

  if (orderType) {
    conditions.push('o.order_type = ?');
    args.push(orderType);
  }

  const result = await db.execute({
    sql: `
      SELECT
        ${ORDER_LIST_COLUMNS},
        t.number AS table_number,
        u.username,
        (
          SELECT COUNT(*)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) AS item_count
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      INNER JOIN users u ON u.id = o.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY o.updated_at DESC
    `,
    args,
  });

  return result.rows.map((row) => mapOrderListItem(row as Record<string, unknown>));
}

export async function listOrdersPendingPayment(): Promise<OrderListItem[]> {
  const result = await db.execute({
    sql: `
      SELECT
        ${ORDER_LIST_COLUMNS},
        t.number AS table_number,
        u.username,
        (
          SELECT COUNT(*)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) AS item_count
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      INNER JOIN users u ON u.id = o.user_id
      WHERE (
        (o.order_type = 'mesa' AND o.status = 'entregado')
        OR (
          o.order_type = 'delivery'
          AND o.delivery_payment_timing = 'on_delivery'
          AND o.status = 'listo'
        )
        OR (
          o.order_type = 'delivery'
          AND o.delivery_payment_timing = 'prepaid'
          AND o.status = 'pendiente'
        )
      )
      ORDER BY o.updated_at DESC
    `,
    args: [],
  });

  return result.rows.map((row) => mapOrderListItem(row as Record<string, unknown>));
}

export async function getOrderDetail(orderId: string) {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const items = await listOrderItems(orderId);
  const payments = await listOrderPayments(orderId);

  return { order, items, payments };
}

export async function payOrder(
  orderId: string,
  cashRegisterId: string,
  payments: OrderPaymentInput[],
): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (!canPayOrder(order)) {
    if (order.order_type === 'delivery' && order.delivery_payment_timing === 'on_delivery') {
      throw new Error('Solo se pueden facturar domicilios listos para entregar');
    }

    if (order.order_type === 'delivery' && order.delivery_payment_timing === 'prepaid') {
      throw new Error('Solo se pueden cobrar domicilios con pago anticipado antes de prepararlos');
    }

    throw new Error('Solo se pueden cobrar comandas entregadas');
  }

  if (payments.length === 0) {
    throw new Error('Debes agregar al menos un pago');
  }

  const rates = await getExchangeRates();
  let totalPaid = 0;

  for (const payment of payments) {
    if (!Number.isFinite(payment.amount_cop) || payment.amount_cop <= 0) {
      throw new Error('Cada pago debe tener un monto mayor a 0');
    }

    const isLegacyUsd =
      payment.payment_method === 'divisas' && payment.foreign_currency === 'usd';
    const isLegacyBs =
      payment.payment_method === 'divisas' && payment.foreign_currency === 'bs';
    const isUsd =
      payment.payment_method === 'usd_efectivo' ||
      payment.payment_method === 'zelle' ||
      payment.payment_method === 'binance_usdt' ||
      isLegacyUsd;
    const isBs =
      payment.payment_method === 'punto_de_venta' ||
      payment.payment_method === 'pago_movil' ||
      isLegacyBs;

    if (isUsd || isBs) {
      if (!payment.foreign_amount || payment.foreign_amount <= 0) {
        throw new Error(
          isBs ? 'El monto en bolívares debe ser mayor a 0' : 'El monto en dólares debe ser mayor a 0',
        );
      }

      const currency = isBs ? 'bs' : 'usd';
      const rate = currency === 'usd' ? rates.usd_rate : rates.bs_rate;
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('La tasa de cambio no está configurada');
      }

      const expectedCop = payment.foreign_amount * rate;
      if (Math.abs(expectedCop - payment.amount_cop) > 1) {
        throw new Error(
          isBs
            ? 'El monto en bolívares no coincide con la tasa de cambio'
            : 'El monto en dólares no coincide con la tasa de cambio',
        );
      }

      if (!payment.foreign_currency) {
        payment.foreign_currency = currency;
      }
    } else if (payment.foreign_currency || payment.foreign_amount) {
      throw new Error('La moneda extranjera solo aplica para pagos en dólares o bolívares');
    }

    totalPaid += payment.amount_cop;
  }

  if (Math.abs(totalPaid - order.total) > 0.5) {
    throw new Error('La suma de los pagos debe igualar el total de la comanda');
  }

  await assertCashRegisterOpen(cashRegisterId);

  const primaryPayment = payments[0];
  const now = new Date().toISOString();

  const batchStatements: SqlStatement[] = [
    {
      sql: `
        UPDATE orders
        SET
          status = 'pagado',
          payment_method = ?,
          foreign_currency = ?,
          foreign_amount = ?,
          cash_register_id = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        primaryPayment.payment_method,
        primaryPayment.foreign_currency ?? null,
        primaryPayment.foreign_amount ?? null,
        cashRegisterId,
        now,
        orderId,
      ],
    },
  ];

  if (order.table_id) {
    batchStatements.push({
      sql: `UPDATE tables SET status = 'limpieza' WHERE id = ? AND status = 'ocupada'`,
      args: [order.table_id],
    });
  }

  await db.batch(batchStatements);

  await createOrderPayments(orderId, payments);

  const updated = await getOrderById(orderId);
  if (!updated) throw new Error('No se pudo cobrar la comanda');
  return updated;
}

export type InvoiceListItem = OrderListItem & {
  payment_method: PaymentMethod;
  foreign_currency: ForeignCurrency | null;
  cashier_username: string;
};

export type PaidOrderFilters = {
  dateFrom?: string;
  dateTo?: string;
  tableId?: string;
  cashierId?: string;
  cashRegisterId?: string;
};

export async function listPaidOrders(filters: PaidOrderFilters = {}): Promise<InvoiceListItem[]> {
  const conditions = ["o.status IN ('pagado', 'entregado')"];
  const args: SqlArgs = [];

  if (filters.dateFrom) {
    conditions.push('o.updated_at >= ?');
    args.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push('o.updated_at <= ?');
    args.push(`${filters.dateTo}T23:59:59.999Z`);
  }

  if (filters.tableId) {
    conditions.push('o.table_id = ?');
    args.push(filters.tableId);
  }

  if (filters.cashierId) {
    conditions.push('cr.opened_by = ?');
    args.push(filters.cashierId);
  }

  if (filters.cashRegisterId) {
    conditions.push('o.cash_register_id = ?');
    args.push(filters.cashRegisterId);
  }

  const result = await db.execute({
    sql: `
      SELECT
        ${ORDER_LIST_COLUMNS},
        t.number AS table_number,
        u.username,
        (
          SELECT COUNT(*)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) AS item_count,
        cashier.username AS cashier_username
      FROM orders o
      LEFT JOIN tables t ON t.id = o.table_id
      INNER JOIN users u ON u.id = o.user_id
      LEFT JOIN cash_registers cr ON cr.id = o.cash_register_id
      LEFT JOIN users cashier ON cashier.id = cr.opened_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY o.updated_at DESC
    `,
    args,
  });

  return result.rows.map((row) => {
    const item = mapOrderListItem(row as Record<string, unknown>);
    return {
      ...item,
      payment_method: (row as Record<string, unknown>).payment_method as PaymentMethod,
      foreign_currency: (row as Record<string, unknown>).foreign_currency
        ? ((row as Record<string, unknown>).foreign_currency as ForeignCurrency)
        : null,
      cashier_username: String((row as Record<string, unknown>).cashier_username ?? '—'),
    };
  });
}

export type PaidOrderWithPayments = InvoiceListItem & {
  payments: OrderPayment[];
};

export async function listPaidOrdersWithPayments(
  filters: PaidOrderFilters = {},
): Promise<PaidOrderWithPayments[]> {
  const orders = await listPaidOrders(filters);
  if (orders.length === 0) return [];

  const payments = await listPaymentsForOrderIds(orders.map((order) => order.id));
  const paymentsByOrder = new Map<string, OrderPayment[]>();

  for (const payment of payments) {
    const list = paymentsByOrder.get(payment.order_id) ?? [];
    list.push(payment);
    paymentsByOrder.set(payment.order_id, list);
  }

  return orders.map((order) => ({
    ...order,
    payments: paymentsByOrder.get(order.id) ?? [],
  }));
}

export async function getPaidOrderDetail(orderId: string) {
  const order = await getOrderById(orderId);
  if (!order || order.status !== 'pagado') return null;

  const items = await listOrderItems(orderId);

  const result = await db.execute({
    sql: `
      SELECT t.number AS table_number, cashier.username AS cashier_username
      FROM orders o
      INNER JOIN tables t ON t.id = o.table_id
      LEFT JOIN cash_registers cr ON cr.id = o.cash_register_id
      LEFT JOIN users cashier ON cashier.id = cr.opened_by
      WHERE o.id = ?
      LIMIT 1
    `,
    args: [orderId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;

  return {
    order,
    items,
    payments: await listOrderPayments(orderId),
    table_number: row ? String(row.table_number) : '',
    cashier_username: row ? String(row.cashier_username ?? '—') : '—',
  };
}
