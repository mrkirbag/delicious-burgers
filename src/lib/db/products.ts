import { isValidMenuCategory } from '@/data/product-categories';
import { createId } from '@/lib/utils/id';

import { db } from './client';
import { getInventoryItemById } from './inventory';
import type { SqlArgs } from './sql';
import type { Product } from './types';

export type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  inventory_product_id: string | null;
  inventory_units_per_sale: number;
  inventory_item_name: string | null;
};

const CATALOG_COLUMNS = `
  p.id,
  p.name,
  p.price,
  p.category,
  p.active,
  p.inventory_product_id,
  p.inventory_units_per_sale,
  inv.name AS inventory_item_name
`;

const CATALOG_FROM = `
  FROM products p
  LEFT JOIN products inv ON inv.id = p.inventory_product_id AND inv.requires_inventory = 1
`;

function mapProduct(row: Record<string, unknown>): CatalogProduct {
  return {
    id: String(row.id),
    name: String(row.name),
    price: Number(row.price),
    category: String(row.category),
    active: Boolean(row.active),
    inventory_product_id: row.inventory_product_id ? String(row.inventory_product_id) : null,
    inventory_units_per_sale: Number(row.inventory_units_per_sale ?? 1),
    inventory_item_name: row.inventory_item_name ? String(row.inventory_item_name) : null,
  };
}

function mapMenuProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    price: Number(row.price),
    category: String(row.category),
    requires_inventory: Boolean(row.requires_inventory),
    active: Boolean(row.active),
    inventory_product_id: row.inventory_product_id ? String(row.inventory_product_id) : null,
    inventory_units_per_sale: Number(row.inventory_units_per_sale ?? 1),
  };
}

export type MenuInventoryLink = {
  requires_inventory: boolean;
  inventory_product_id: string | null;
  inventory_units_per_sale: number;
};

export { isValidMenuCategory };

export async function getMenuProductInventoryLink(
  productId: string,
): Promise<MenuInventoryLink | null> {
  const result = await db.execute({
    sql: `
      SELECT requires_inventory, inventory_product_id, inventory_units_per_sale
      FROM products
      WHERE id = ?
      LIMIT 1
    `,
    args: [productId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    requires_inventory: Boolean(row.requires_inventory),
    inventory_product_id: row.inventory_product_id ? String(row.inventory_product_id) : null,
    inventory_units_per_sale: Number(row.inventory_units_per_sale ?? 1),
  };
}

async function validateInventoryLink(
  category: string,
  inventoryProductId: string | null | undefined,
  inventoryUnitsPerSale?: number,
): Promise<{ inventory_product_id: string | null; inventory_units_per_sale: number }> {
  if (!inventoryProductId) {
    return { inventory_product_id: null, inventory_units_per_sale: 1 };
  }

  if (category !== 'bebidas') {
    throw new Error('Solo las bebidas del menú pueden vincularse al inventario');
  }

  const item = await getInventoryItemById(inventoryProductId);
  if (!item) {
    throw new Error('El ítem de inventario seleccionado no existe');
  }

  const units = inventoryUnitsPerSale ?? 1;
  if (!Number.isInteger(units) || units < 1) {
    throw new Error('Las unidades por venta deben ser al menos 1');
  }

  return {
    inventory_product_id: inventoryProductId,
    inventory_units_per_sale: units,
  };
}

export async function listCatalogProducts(category?: string): Promise<CatalogProduct[]> {
  const sql = category
    ? `SELECT ${CATALOG_COLUMNS} ${CATALOG_FROM}
       WHERE p.requires_inventory = 0 AND p.category = ?
       ORDER BY p.category ASC, p.name ASC`
    : `SELECT ${CATALOG_COLUMNS} ${CATALOG_FROM}
       WHERE p.requires_inventory = 0
       ORDER BY p.category ASC, p.name ASC`;

  const result = await db.execute({
    sql,
    args: category ? [category] : [],
  });

  return result.rows.map((row) => mapProduct(row as Record<string, unknown>));
}

export async function getCatalogProductById(id: string): Promise<CatalogProduct | null> {
  const result = await db.execute({
    sql: `SELECT ${CATALOG_COLUMNS} ${CATALOG_FROM}
          WHERE p.id = ? AND p.requires_inventory = 0 LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return mapProduct(result.rows[0] as Record<string, unknown>);
}

export async function getProductByName(
  name: string,
  requiresInventory: boolean,
): Promise<CatalogProduct | null> {
  const result = await db.execute({
    sql: `SELECT ${CATALOG_COLUMNS} ${CATALOG_FROM}
          WHERE LOWER(p.name) = LOWER(?) AND p.requires_inventory = ? LIMIT 1`,
    args: [name, requiresInventory ? 1 : 0],
  });

  if (result.rows.length === 0) return null;
  return mapProduct(result.rows[0] as Record<string, unknown>);
}

export async function countProductInOrders(productId: string): Promise<number> {
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?',
    args: [productId],
  });

  return Number(result.rows[0].count);
}

type CreateCatalogProductInput = {
  name: string;
  price: number;
  category: string;
  inventory_product_id?: string | null;
  inventory_units_per_sale?: number;
};

export async function createCatalogProduct(
  input: CreateCatalogProductInput,
): Promise<CatalogProduct> {
  const inventoryLink = await validateInventoryLink(
    input.category,
    input.inventory_product_id,
    input.inventory_units_per_sale,
  );

  const id = createId();

  await db.execute({
    sql: `
      INSERT INTO products (
        id, name, price, category, requires_inventory, active,
        inventory_product_id, inventory_units_per_sale
      )
      VALUES (?, ?, ?, ?, 0, 1, ?, ?)
    `,
    args: [
      id,
      input.name,
      input.price,
      input.category,
      inventoryLink.inventory_product_id,
      inventoryLink.inventory_units_per_sale,
    ],
  });

  const product = await getCatalogProductById(id);
  if (!product) throw new Error('No se pudo crear el producto');
  return product;
}

type UpdateCatalogProductInput = {
  name?: string;
  price?: number;
  category?: string;
  active?: boolean;
  inventory_product_id?: string | null;
  inventory_units_per_sale?: number;
};

export async function updateCatalogProduct(
  id: string,
  input: UpdateCatalogProductInput,
): Promise<CatalogProduct | null> {
  const current = await getCatalogProductById(id);
  if (!current) return null;

  const nextCategory = input.category ?? current.category;
  const fields: string[] = [];
  const args: SqlArgs = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    args.push(input.name);
  }

  if (input.price !== undefined) {
    fields.push('price = ?');
    args.push(input.price);
  }

  if (input.category !== undefined) {
    fields.push('category = ?');
    args.push(input.category);
  }

  if (input.active !== undefined) {
    fields.push('active = ?');
    args.push(input.active ? 1 : 0);
  }

  const inventoryTouched =
    input.inventory_product_id !== undefined || input.inventory_units_per_sale !== undefined;

  if (inventoryTouched || (input.category !== undefined && nextCategory !== 'bebidas')) {
    const inventoryProductId =
      nextCategory === 'bebidas'
        ? (input.inventory_product_id ?? current.inventory_product_id)
        : null;
    const inventoryUnitsPerSale =
      nextCategory === 'bebidas'
        ? (input.inventory_units_per_sale ?? current.inventory_units_per_sale)
        : 1;

    const inventoryLink = await validateInventoryLink(
      nextCategory,
      inventoryProductId,
      inventoryUnitsPerSale,
    );

    fields.push('inventory_product_id = ?');
    args.push(inventoryLink.inventory_product_id);
    fields.push('inventory_units_per_sale = ?');
    args.push(inventoryLink.inventory_units_per_sale);
  }

  if (fields.length === 0) {
    return current;
  }

  await db.execute({
    sql: `UPDATE products SET ${fields.join(', ')} WHERE id = ? AND requires_inventory = 0`,
    args: [...args, id],
  });

  return getCatalogProductById(id);
}

export async function deleteCatalogProduct(id: string): Promise<boolean> {
  const result = await db.execute({
    sql: 'DELETE FROM products WHERE id = ? AND requires_inventory = 0',
    args: [id],
  });

  return result.rowsAffected > 0;
}

/** Producto activo del menú por ID (para comandas). */
export async function getActiveMenuProductById(id: string): Promise<Product | null> {
  const result = await db.execute({
    sql: `SELECT id, name, price, category, requires_inventory, active,
                 inventory_product_id, inventory_units_per_sale
          FROM products
          WHERE id = ? AND requires_inventory = 0 AND active = 1
          LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return mapMenuProduct(result.rows[0] as Record<string, unknown>);
}

/** Productos activos del menú para comandas. */
export async function listActiveMenuProducts(): Promise<Product[]> {
  const result = await db.execute({
    sql: `SELECT id, name, price, category, requires_inventory, active,
                 inventory_product_id, inventory_units_per_sale
          FROM products
          WHERE requires_inventory = 0 AND active = 1
          ORDER BY category ASC, name ASC`,
    args: [],
  });

  return result.rows.map((row) => mapMenuProduct(row as Record<string, unknown>));
}
