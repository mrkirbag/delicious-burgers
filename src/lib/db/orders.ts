import {
  canMarkOrderDelivered,
  canPayOrder,
  canSendOrderToKitchen,
  getDeliveryPaymentTiming,
  type DeliveryPaymentTiming,
} from '@/lib/orders/delivery-flow';
import { resolveInventoryDeduction, type InventoryDeduction } from '@/lib/inventory/menu-inventory';
import {
  ADICIONALES_CATEGORY,
  parseOrderItemExtras,
  productUsesAdicionales,
  sumExtrasPrice,
} from '@/lib/orders/item-extras';
import { isForeignAmountWithinRate, foreignRoundingToleranceCop } from '@/lib/payments/settlement';
import { createId } from '@/lib/utils/id';
import { roundToCents } from '@/lib/utils/currency';

import { db } from './client';
import {
  deductInventoryForOrder,
  getInventoryItemById,
  restoreInventoryForOrder,
} from './inventory';
import {
  getActiveMenuProductById,
  getActiveMenuProductsByIds,
  getMenuProductInventoryLink,
} from './products';
import { countActiveOrdersForTable, getTableById } from './tables';
import { assertCashRegisterOpen } from './cash-registers';
import { getExchangeRates } from './exchange-rates';
import { createOrderPayments, listOrderPayments, listPaymentsForOrderIds } from './order-payments';
import type { SqlArgs } from './sql';
import type {
  Order,
  OrderItem,
  OrderItemExtra,
  OrderPayment,
  OrderPaymentInput,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ForeignCurrency,
} from './types';

/** Activa hasta entregar; incluye entregado sin cobrar (comandas del flujo anterior). */
const ACTIVE_ORDER_SQL = `(
  o.status IN ('pendiente', 'pagado', 'cocina', 'listo')
  OR (o.status = 'entregado' AND o.cash_register_id IS NULL)
)`;

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
    extras: parseOrderItemExtras(row.extras),
    price_at_sale: Number(row.price_at_sale),
    product_name: String(row.product_name),
    product_category: String(row.product_category),
  };
}

function mergeInventoryDeductions(deductions: InventoryDeduction[]): InventoryDeduction[] {
  const byProduct = new Map<string, number>();

  for (const deduction of deductions) {
    byProduct.set(deduction.productId, (byProduct.get(deduction.productId) ?? 0) + deduction.quantity);
  }

  return [...byProduct.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function inventoryDelta(
  previous: InventoryDeduction[],
  next: InventoryDeduction[],
): { deduct: InventoryDeduction[]; restore: InventoryDeduction[] } {
  const previousByProduct = new Map(previous.map((item) => [item.productId, item.quantity]));
  const nextByProduct = new Map(next.map((item) => [item.productId, item.quantity]));
  const productIds = new Set([...previousByProduct.keys(), ...nextByProduct.keys()]);
  const deduct: InventoryDeduction[] = [];
  const restore: InventoryDeduction[] = [];

  for (const productId of productIds) {
    const delta = (nextByProduct.get(productId) ?? 0) - (previousByProduct.get(productId) ?? 0);
    if (delta > 0) deduct.push({ productId, quantity: delta });
    if (delta < 0) restore.push({ productId, quantity: -delta });
  }

  return { deduct, restore };
}

async function resolveDeductionsForStoredItem(
  item: Pick<OrderItemWithProduct, 'product_id' | 'extras'>,
  quantity: number,
): Promise<InventoryDeduction[]> {
  const deductions: InventoryDeduction[] = [];
  const mainLink = await getMenuProductInventoryLink(item.product_id);

  if (mainLink) {
    const mainDeduction = resolveInventoryDeduction(item.product_id, mainLink, quantity);
    if (mainDeduction) deductions.push(mainDeduction);
  }

  for (const extra of item.extras) {
    const extraLink = await getMenuProductInventoryLink(extra.product_id);
    if (!extraLink) continue;

    const extraDeduction = resolveInventoryDeduction(extra.product_id, extraLink, quantity);
    if (extraDeduction) deductions.push(extraDeduction);
  }

  return mergeInventoryDeductions(deductions);
}

async function resolveExtrasFromIds(ids: string[]): Promise<OrderItemExtra[]> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const products = await getActiveMenuProductsByIds(uniqueIds);
  if (products.length !== uniqueIds.length) {
    throw new Error('Uno o más adicionales no están disponibles');
  }

  const invalid = products.find((product) => product.category !== ADICIONALES_CATEGORY);
  if (invalid) {
    throw new Error('Solo se pueden agregar productos de la categoría Adicionales');
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  return uniqueIds.map((id) => {
    const product = byId.get(id);
    if (!product) {
      throw new Error('Uno o más adicionales no están disponibles');
    }

    return {
      product_id: product.id,
      name: product.name,
      price: product.price,
    };
  });
}

async function deductInventoryList(
  deductions: InventoryDeduction[],
  userId: string,
  orderId: string,
): Promise<void> {
  const applied: InventoryDeduction[] = [];

  try {
    for (const deduction of deductions) {
      await validateInventoryDeduction(deduction);
      await deductInventoryForOrder(deduction.productId, deduction.quantity, userId, orderId);
      applied.push(deduction);
    }
  } catch (error) {
    for (const deduction of applied.reverse()) {
      await restoreInventoryForOrder(deduction.productId, deduction.quantity, userId, orderId);
    }
    throw error;
  }
}

async function restoreInventoryList(
  deductions: InventoryDeduction[],
  userId: string,
  orderId: string,
): Promise<void> {
  for (const deduction of deductions) {
    await restoreInventoryForOrder(deduction.productId, deduction.quantity, userId, orderId);
  }
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
      FROM orders o
      WHERE o.table_id = ?
        AND ${ACTIVE_ORDER_SQL}
      ORDER BY o.created_at DESC
      LIMIT 1
    `,
    args: [tableId],
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
        oi.extras,
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
        oi.extras,
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
  adicionalIds?: string[];
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

  const extras = await resolveExtrasFromIds(input.adicionalIds ?? []);
  if (extras.length > 0 && !productUsesAdicionales(product.category)) {
    throw new Error('Este producto no admite adicionales');
  }

  const notes = input.notes?.trim() || null;
  const priceAtSale = product.price + sumExtrasPrice(extras);
  const extrasJson = extras.length > 0 ? JSON.stringify(extras) : null;

  const deductions = await resolveDeductionsForStoredItem(
    { product_id: product.id, extras },
    quantity,
  );

  for (const deduction of deductions) {
    await validateInventoryDeduction(deduction);
  }

  const itemId = createId();

  await db.execute({
    sql: `
      INSERT INTO order_items (id, order_id, product_id, quantity, notes, extras, price_at_sale)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [itemId, orderId, product.id, quantity, notes, extrasJson, priceAtSale],
  });

  try {
    await deductInventoryList(deductions, userId, order.id);
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

    const previousDeductions = await resolveDeductionsForStoredItem(existing, existing.quantity);
    const nextDeductions = await resolveDeductionsForStoredItem(existing, newQuantity);
    const { deduct, restore } = inventoryDelta(previousDeductions, nextDeductions);

    for (const deduction of deduct) {
      await validateInventoryDeduction(deduction);
    }

    await deductInventoryList(deduct, userId, existing.order_id);
    await restoreInventoryList(restore, userId, existing.order_id);

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

  const deductions = await resolveDeductionsForStoredItem(existing, existing.quantity);
  await restoreInventoryList(deductions, userId, existing.order_id);

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
    if (order.status === 'pendiente') {
      throw new Error('Debes cobrar y facturar la comanda antes de enviarla a cocina');
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

  // Un clic: listo = entregado. Mesa pasa a limpieza para liberarla después.
  const updated = await updateOrderStatus(orderId, 'entregado');

  if (order.table_id) {
    await db.execute({
      sql: `UPDATE tables SET status = 'limpieza' WHERE id = ? AND status = 'ocupada'`,
      args: [order.table_id],
    });
  }

  return updated;
}

export async function markOrderDelivered(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Comanda no encontrada');
  }

  if (!canMarkOrderDelivered(order)) {
    throw new Error('La comanda no está lista para entregar');
  }

  const updated = await updateOrderStatus(orderId, 'entregado');

  if (order.table_id) {
    await db.execute({
      sql: `UPDATE tables SET status = 'limpieza' WHERE id = ? AND status = 'ocupada'`,
      args: [order.table_id],
    });
  }

  return updated;
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
    const deductions = await resolveDeductionsForStoredItem(item, item.quantity);
    await restoreInventoryList(deductions, userId, orderId);
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
  const conditions: string[] = [`o.status != 'cancelado'`, ACTIVE_ORDER_SQL];
  const args: SqlArgs = [];

  if (statuses) {
    conditions.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
    args.push(...statuses);
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
        (o.status = 'pendiente' AND (
          SELECT COUNT(*)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ) > 0)
        OR (o.order_type = 'mesa' AND o.status = 'entregado' AND o.cash_register_id IS NULL)
        OR (
          o.order_type = 'delivery'
          AND o.delivery_payment_timing = 'on_delivery'
          AND o.status = 'listo'
          AND o.cash_register_id IS NULL
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
    throw new Error('Solo se pueden cobrar comandas pendientes');
  }

  const wasAlreadyDelivered = order.status === 'entregado';

  const items = await listOrderItems(orderId);
  if (items.length === 0) {
    throw new Error('Agrega al menos un producto antes de cobrar');
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

      payment.foreign_amount = roundToCents(payment.foreign_amount);

      if (!isForeignAmountWithinRate(payment.foreign_amount, payment.amount_cop, rate)) {
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

  const roundingGap = order.total - totalPaid;
  if (Math.abs(roundingGap) > 0.5) {
    const lastForeign = [...payments]
      .reverse()
      .find((payment) => payment.foreign_amount && payment.foreign_amount > 0);

    if (lastForeign) {
      const rate =
        lastForeign.foreign_currency === 'bs' ||
        lastForeign.payment_method === 'punto_de_venta' ||
        lastForeign.payment_method === 'pago_movil'
          ? rates.bs_rate
          : rates.usd_rate;

      if (Math.abs(roundingGap) <= foreignRoundingToleranceCop(rate)) {
        lastForeign.amount_cop += roundingGap;
        totalPaid = order.total;
      }
    }
  }

  if (Math.abs(totalPaid - order.total) > 0.5) {
    throw new Error('La suma de los pagos debe igualar el total de la comanda');
  }

  await assertCashRegisterOpen(cashRegisterId);

  const primaryPayment = payments[0];
  const now = new Date().toISOString();

  // Flujo nuevo: pendiente → cocina (cobrado + enviado). Legacy conserva estado.
  let nextStatus: OrderStatus;
  if (order.status === 'listo') {
    nextStatus = 'listo';
  } else if (order.status === 'entregado') {
    nextStatus = 'pagado';
  } else {
    nextStatus = 'cocina';
  }

  await db.execute({
    sql: `
      UPDATE orders
      SET
        status = ?,
        payment_method = ?,
        foreign_currency = ?,
        foreign_amount = ?,
        cash_register_id = ?,
        updated_at = ?
      WHERE id = ?
    `,
    args: [
      nextStatus,
      primaryPayment.payment_method,
      primaryPayment.foreign_currency ?? null,
      primaryPayment.foreign_amount ?? null,
      cashRegisterId,
      now,
      orderId,
    ],
  });

  // Legacy: mesa ya entregada → al cobrar pasa a limpieza
  if (order.table_id && wasAlreadyDelivered) {
    await db.execute({
      sql: `UPDATE tables SET status = 'limpieza' WHERE id = ? AND status = 'ocupada'`,
      args: [order.table_id],
    });
  }

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
  // Paid orders keep cash_register_id even after status advances (cocina → listo → entregado).
  const conditions = ['o.cash_register_id IS NOT NULL'];
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
  if (!order || !order.cash_register_id) return null;

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
