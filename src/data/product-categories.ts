export type MenuCategory = {
  id: string;
  label: string;
};

export type InventoryCategory = {
  id: string;
  label: string;
};

export type InventoryUnit = {
  id: string;
  label: string;
};

/** Categorías del menú para comandas (requires_inventory = false). */
export const menuCategories: MenuCategory[] = [
  { id: 'hamburguesas', label: 'Hamburguesas' },
  { id: 'combos', label: 'Combos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'extras', label: 'Extras' },
  { id: 'postres', label: 'Postres' },
];

/** Categorías de insumos controlados en inventario. */
export const inventoryCategories: InventoryCategory[] = [
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'panaderia', label: 'Panadería' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'empaques', label: 'Empaques' },
];

export const inventoryUnits: InventoryUnit[] = [
  { id: 'cajas', label: 'Cajas' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'bolsas', label: 'Bolsas' },
  { id: 'kg', label: 'Kilogramos' },
  { id: 'litros', label: 'Litros' },
];

export function getMenuCategoryLabel(id: string): string {
  return menuCategories.find((c) => c.id === id)?.label ?? id;
}

export function getInventoryCategoryLabel(id: string): string {
  return inventoryCategories.find((c) => c.id === id)?.label ?? id;
}

export function getInventoryUnitLabel(id: string): string {
  return inventoryUnits.find((u) => u.id === id)?.label ?? id;
}

export function isValidMenuCategory(id: string): boolean {
  return menuCategories.some((c) => c.id === id);
}

export function isValidInventoryCategory(id: string): boolean {
  return inventoryCategories.some((c) => c.id === id);
}

export function isValidInventoryUnit(id: string): boolean {
  return inventoryUnits.some((u) => u.id === id);
}
