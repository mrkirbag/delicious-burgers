import type { APIRoute } from 'astro';

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  createCatalogProduct,
  getProductByName,
  isValidMenuCategory,
  listCatalogProducts,
} from '@/lib/db/products';

export const GET: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  const category = context.url.searchParams.get('category') ?? undefined;

  if (category && !isValidMenuCategory(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 });
  }

  const products = await listCatalogProducts(category);
  return Response.json({ products });
};

export const POST: APIRoute = async (context) => {
  const auth = requireAdmin(context);
  if (auth instanceof Response) return auth;

  let body: {
    name?: string;
    price?: number;
    category?: string;
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

  if (!name || name.length < 2) {
    return Response.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 });
  }

  if (price === undefined || Number.isNaN(Number(price)) || Number(price) < 0) {
    return Response.json({ error: 'Precio inválido' }, { status: 400 });
  }

  if (!category || !isValidMenuCategory(category)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 });
  }

  const existing = await getProductByName(name, false);
  if (existing) {
    return Response.json({ error: 'Ya existe un producto del menú con ese nombre' }, { status: 409 });
  }

  try {
    const product = await createCatalogProduct({
      name,
      price: Number(price),
      category,
      inventory_product_id: body.inventory_product_id ?? null,
      inventory_units_per_sale: body.inventory_units_per_sale,
    });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear el producto';
    return Response.json({ error: message }, { status: 400 });
  }
};
