import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  createInventoryItem,
  getInventoryItemByName,
  isValidInventoryCategory,
  isValidInventoryUnit,
  listInventoryItems,
} from '@/lib/db/inventory';

export const GET: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const category = context.url.searchParams.get('category') ?? undefined;

  if (category && !isValidInventoryCategory(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 });
  }

  const items = await listInventoryItems(category);
  return Response.json({ items });
};

export const POST: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  let body: {
    name?: string;
    category?: string;
    unit?: string;
    stock?: number;
    min_stock?: number;
  };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const name = body.name?.trim();
  const category = body.category;
  const unit = body.unit;
  const stock = body.stock !== undefined ? Number(body.stock) : 0;
  const minStock = body.min_stock !== undefined ? Number(body.min_stock) : 5;

  if (!name || name.length < 2) {
    return Response.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 });
  }

  if (!category || !isValidInventoryCategory(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 });
  }

  if (!unit || !isValidInventoryUnit(unit)) {
    return Response.json({ error: 'Unidad inválida' }, { status: 400 });
  }

  if (Number.isNaN(stock) || stock < 0) {
    return Response.json({ error: 'Stock inicial inválido' }, { status: 400 });
  }

  if (Number.isNaN(minStock) || minStock < 0) {
    return Response.json({ error: 'Stock mínimo inválido' }, { status: 400 });
  }

  const existing = await getInventoryItemByName(name);
  if (existing) {
    return Response.json({ error: 'Ya existe un ítem de inventario con ese nombre' }, { status: 409 });
  }

  const item = await createInventoryItem({
    name,
    category,
    unit,
    stock,
    min_stock: minStock,
    userId: auth.userId,
  });

  return Response.json({ item }, { status: 201 });
};
