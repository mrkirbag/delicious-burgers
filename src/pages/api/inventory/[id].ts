import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  deleteInventoryItem,
  getInventoryItemById,
  getInventoryItemByName,
  isValidInventoryCategory,
  isValidInventoryUnit,
  updateInventoryItem,
} from '@/lib/db/inventory';

async function getTargetItem(id: string) {
  const item = await getInventoryItemById(id);
  if (!item) {
    return Response.json({ error: 'Ítem no encontrado' }, { status: 404 });
  }
  return item;
}

export const PATCH: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetItem(id);
  if (target instanceof Response) return target;

  let body: { name?: string; category?: string; unit?: string; min_stock?: number };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const name = body.name?.trim();
  const category = body.category;
  const unit = body.unit;
  const minStock = body.min_stock !== undefined ? Number(body.min_stock) : undefined;

  if (name !== undefined && name.length < 2) {
    return Response.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 });
  }

  if (category !== undefined && !isValidInventoryCategory(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 });
  }

  if (unit !== undefined && !isValidInventoryUnit(unit)) {
    return Response.json({ error: 'Unidad inválida' }, { status: 400 });
  }

  if (minStock !== undefined && (Number.isNaN(minStock) || minStock < 0)) {
    return Response.json({ error: 'Stock mínimo inválido' }, { status: 400 });
  }

  if (name && name.toLowerCase() !== target.name.toLowerCase()) {
    const existing = await getInventoryItemByName(name);
    if (existing && existing.id !== id) {
      return Response.json(
        { error: 'Ya existe un ítem de inventario con ese nombre' },
        { status: 409 },
      );
    }
  }

  const item = await updateInventoryItem(id, {
    name,
    category,
    unit,
    min_stock: minStock,
  });

  return Response.json({ item });
};

export const DELETE: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetItem(id);
  if (target instanceof Response) return target;

  await deleteInventoryItem(id);
  return Response.json({ ok: true });
};
