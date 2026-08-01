import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  countProductInOrders,
  deleteCatalogProduct,
  getCatalogProductById,
  getProductByName,
  isValidMenuCategory,
  updateCatalogProduct,
} from '@/lib/db/products';

async function getTargetProduct(id: string) {
  const product = await getCatalogProductById(id);
  if (!product) {
    return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  return product;
}

export const PATCH: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetProduct(id);
  if (target instanceof Response) return target;

  let body: {
    name?: string;
    price?: number;
    category?: string;
    active?: boolean;
    inventory_product_id?: string | null;
    inventory_units_per_sale?: number;
  };

  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const name = body.name?.trim();
  const price = body.price;
  const category = body.category;
  const active = body.active;

  if (name !== undefined && name.length < 2) {
    return Response.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 });
  }

  if (price !== undefined && (Number.isNaN(Number(price)) || Number(price) < 0)) {
    return Response.json({ error: 'Precio inválido' }, { status: 400 });
  }

  if (category !== undefined && !isValidMenuCategory(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 });
  }

  if (name && name.toLowerCase() !== target.name.toLowerCase()) {
    const existing = await getProductByName(name, false);
    if (existing && existing.id !== id) {
      return Response.json({ error: 'Ya existe un producto del menú con ese nombre' }, { status: 409 });
    }
  }

  try {
    const product = await updateCatalogProduct(id, {
      name,
      price: price !== undefined ? Number(price) : undefined,
      category,
      active,
      inventory_product_id: body.inventory_product_id,
      inventory_units_per_sale: body.inventory_units_per_sale,
    });

    return Response.json({ product });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar el producto';
    return Response.json({ error: message }, { status: 400 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: 'ID requerido' }, { status: 400 });
  }

  const target = await getTargetProduct(id);
  if (target instanceof Response) return target;

  const orderCount = await countProductInOrders(id);
  if (orderCount > 0) {
    return Response.json(
      { error: 'No se puede eliminar: el producto ya fue usado en comandas' },
      { status: 409 },
    );
  }

  await deleteCatalogProduct(id);
  return Response.json({ ok: true });
};
