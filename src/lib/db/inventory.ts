import {
  isValidInventoryCategory,
  isValidInventoryUnit,
} from '@/data/product-categories';
import { createId } from '@/lib/utils/id';

import { db } from './client';
import type { SqlArgs } from './sql';
import type { InventoryMovement, InventoryMovementType } from './types';

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  unit: string;
  low_stock: boolean;
};

export type InventoryMovementRecord = InventoryMovement & {
  username: string;
};

function mapInventoryItem(row: Record<string, unknown>): InventoryItem {
  const stock = Number(row.stock);
  const minStock = Number(row.min_stock);

  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    stock,
    min_stock: minStock,
    unit: String(row.unit),
    low_stock: stock <= minStock,
  };
}

function mapMovement(row: Record<string, unknown>): InventoryMovementRecord {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    type: row.type as InventoryMovementType,
    quantity: Number(row.quantity),
    reason: row.reason ? String(row.reason) : null,
    user_id: String(row.user_id),
    created_at: String(row.created_at),
    username: String(row.username),
  };
}

export { isValidInventoryCategory, isValidInventoryUnit };

export async function listInventoryItems(category?: string): Promise<InventoryItem[]> {
  const sql = category
    ? `SELECT p.id, p.name, p.category, i.stock, i.min_stock, i.unit
       FROM products p
       INNER JOIN inventory i ON i.product_id = p.id
       WHERE p.requires_inventory = 1 AND p.category = ?
       ORDER BY p.category ASC, p.name ASC`
    : `SELECT p.id, p.name, p.category, i.stock, i.min_stock, i.unit
       FROM products p
       INNER JOIN inventory i ON i.product_id = p.id
       WHERE p.requires_inventory = 1
       ORDER BY p.category ASC, p.name ASC`;

  const result = await db.execute({
    sql,
    args: category ? [category] : [],
  });

  return result.rows.map((row) => mapInventoryItem(row as Record<string, unknown>));
}

export async function getInventoryItemById(id: string): Promise<InventoryItem | null> {
  const result = await db.execute({
    sql: `SELECT p.id, p.name, p.category, i.stock, i.min_stock, i.unit
          FROM products p
          INNER JOIN inventory i ON i.product_id = p.id
          WHERE p.id = ? AND p.requires_inventory = 1
          LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return mapInventoryItem(result.rows[0] as Record<string, unknown>);
}

export async function getInventoryItemByName(name: string): Promise<InventoryItem | null> {
  const result = await db.execute({
    sql: `SELECT p.id, p.name, p.category, i.stock, i.min_stock, i.unit
          FROM products p
          INNER JOIN inventory i ON i.product_id = p.id
          WHERE LOWER(p.name) = LOWER(?) AND p.requires_inventory = 1
          LIMIT 1`,
    args: [name],
  });

  if (result.rows.length === 0) return null;
  return mapInventoryItem(result.rows[0] as Record<string, unknown>);
}

type CreateInventoryItemInput = {
  name: string;
  category: string;
  unit: string;
  stock?: number;
  min_stock?: number;
  userId: string;
};

export async function createInventoryItem(
  input: CreateInventoryItemInput,
): Promise<InventoryItem> {
  const id = createId();
  const stock = input.stock ?? 0;
  const minStock = input.min_stock ?? 5;

  await db.execute({
    sql: `
      INSERT INTO products (id, name, price, category, requires_inventory, active)
      VALUES (?, ?, 0, ?, 1, 1)
    `,
    args: [id, input.name, input.category],
  });

  await db.execute({
    sql: `
      INSERT INTO inventory (product_id, stock, min_stock, unit)
      VALUES (?, ?, ?, ?)
    `,
    args: [id, stock, minStock, input.unit],
  });

  if (stock > 0) {
    await db.execute({
      sql: `
        INSERT INTO inventory_movements (id, product_id, type, quantity, reason, user_id)
        VALUES (?, ?, 'entrada', ?, 'Stock inicial', ?)
      `,
      args: [createId(), id, stock, input.userId],
    });
  }

  const item = await getInventoryItemById(id);
  if (!item) throw new Error('No se pudo crear el ítem de inventario');
  return item;
}

type UpdateInventoryItemInput = {
  name?: string;
  category?: string;
  unit?: string;
  min_stock?: number;
};

export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput,
): Promise<InventoryItem | null> {
  if (input.name !== undefined || input.category !== undefined) {
    const productFields: string[] = [];
    const productArgs: SqlArgs = [];

    if (input.name !== undefined) {
      productFields.push('name = ?');
      productArgs.push(input.name);
    }

    if (input.category !== undefined) {
      productFields.push('category = ?');
      productArgs.push(input.category);
    }

    await db.execute({
      sql: `UPDATE products SET ${productFields.join(', ')} WHERE id = ? AND requires_inventory = 1`,
      args: [...productArgs, id],
    });
  }

  if (input.unit !== undefined || input.min_stock !== undefined) {
    const inventoryFields: string[] = [];
    const inventoryArgs: SqlArgs = [];

    if (input.unit !== undefined) {
      inventoryFields.push('unit = ?');
      inventoryArgs.push(input.unit);
    }

    if (input.min_stock !== undefined) {
      inventoryFields.push('min_stock = ?');
      inventoryArgs.push(input.min_stock);
    }

    await db.execute({
      sql: `UPDATE inventory SET ${inventoryFields.join(', ')} WHERE product_id = ?`,
      args: [...inventoryArgs, id],
    });
  }

  return getInventoryItemById(id);
}

export async function deleteInventoryItem(id: string): Promise<boolean> {
  await db.execute({
    sql: 'DELETE FROM inventory_movements WHERE product_id = ?',
    args: [id],
  });

  await db.execute({
    sql: 'DELETE FROM inventory WHERE product_id = ?',
    args: [id],
  });

  const result = await db.execute({
    sql: 'DELETE FROM products WHERE id = ? AND requires_inventory = 1',
    args: [id],
  });

  return result.rowsAffected > 0;
}

type RegisterMovementInput = {
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  reason?: string;
  userId: string;
};

export async function registerInventoryMovement(
  input: RegisterMovementInput,
): Promise<InventoryItem | null> {
  const item = await getInventoryItemById(input.productId);
  if (!item) return null;

  if (input.type === 'salida' && item.stock < input.quantity) {
    throw new Error('Stock insuficiente');
  }

  const newStock =
    input.type === 'entrada' ? item.stock + input.quantity : item.stock - input.quantity;

  await db.execute({
    sql: 'UPDATE inventory SET stock = ? WHERE product_id = ?',
    args: [newStock, input.productId],
  });

  await db.execute({
    sql: `
      INSERT INTO inventory_movements (id, product_id, type, quantity, reason, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      createId(),
      input.productId,
      input.type,
      input.quantity,
      input.reason?.trim() || null,
      input.userId,
    ],
  });

  return getInventoryItemById(input.productId);
}

export async function listInventoryMovements(
  productId: string,
  limit = 50,
): Promise<InventoryMovementRecord[]> {
  const result = await db.execute({
    sql: `
      SELECT m.id, m.product_id, m.type, m.quantity, m.reason, m.user_id, m.created_at,
             COALESCE(u.username, 'sistema') AS username
      FROM inventory_movements m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.product_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `,
    args: [productId, limit],
  });

  return result.rows.map((row) => mapMovement(row as Record<string, unknown>));
}

export async function deductInventoryForOrder(
  productId: string,
  quantity: number,
  userId: string,
  orderId: string,
): Promise<void> {
  const item = await getInventoryItemById(productId);
  if (!item) {
    throw new Error('Producto sin registro de inventario');
  }

  if (item.stock < quantity) {
    throw new Error(`Stock insuficiente de ${item.name}`);
  }

  await db.execute({
    sql: 'UPDATE inventory SET stock = stock - ? WHERE product_id = ?',
    args: [quantity, productId],
  });

  await db.execute({
    sql: `
      INSERT INTO inventory_movements (id, product_id, type, quantity, reason, user_id)
      VALUES (?, ?, 'salida', ?, ?, ?)
    `,
    args: [createId(), productId, quantity, `Comanda ${orderId.slice(0, 8)}`, userId],
  });
}

export async function restoreInventoryForOrder(
  productId: string,
  quantity: number,
  userId: string,
  orderId: string,
): Promise<void> {
  const item = await getInventoryItemById(productId);
  if (!item) return;

  await db.execute({
    sql: 'UPDATE inventory SET stock = stock + ? WHERE product_id = ?',
    args: [quantity, productId],
  });

  await db.execute({
    sql: `
      INSERT INTO inventory_movements (id, product_id, type, quantity, reason, user_id)
      VALUES (?, ?, 'entrada', ?, ?, ?)
    `,
    args: [createId(), productId, quantity, `Devolución comanda ${orderId.slice(0, 8)}`, userId],
  });
}
