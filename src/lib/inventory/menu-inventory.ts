export type MenuInventoryLink = {
  requires_inventory: boolean;
  inventory_product_id: string | null;
  inventory_units_per_sale: number;
};

export type InventoryDeduction = {
  productId: string;
  quantity: number;
};

/** Resuelve qué ítem de inventario descontar al vender un producto del menú. */
export function resolveInventoryDeduction(
  menuProductId: string,
  link: MenuInventoryLink,
  orderItemQuantity: number,
): InventoryDeduction | null {
  if (link.inventory_product_id) {
    const unitsPerSale = Math.max(1, link.inventory_units_per_sale || 1);
    return {
      productId: link.inventory_product_id,
      quantity: orderItemQuantity * unitsPerSale,
    };
  }

  if (link.requires_inventory) {
    return {
      productId: menuProductId,
      quantity: orderItemQuantity,
    };
  }

  return null;
}
