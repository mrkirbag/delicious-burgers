import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

import { brand } from '@/data/brand';
import {
  getInventoryCategoryLabel,
  getInventoryUnitLabel,
  getMenuCategoryLabel,
  menuCategories,
} from '@/data/product-categories';
import { useToast } from '@/components/providers/ToastProvider';
import { Alert, EmptyState, SkeletonTable } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import { parseError } from '@/lib/api/parseError';
import type { CatalogProduct } from '@/lib/db/products';
import { useInventory } from '@/lib/hooks/queries/useInventory';
import { useProducts } from '@/lib/hooks/queries/useProducts';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';

import './ProductsManager.css';

type FormMode = 'create' | 'edit';
type CategoryFilter = string | 'all';

type ProductFormState = {
  name: string;
  price: string;
  category: string;
  active: boolean;
  inventory_product_id: string;
  inventory_units_per_sale: string;
};

const emptyForm: ProductFormState = {
  name: '',
  price: '',
  category: menuCategories[0]?.id ?? 'hamburguesas',
  active: true,
  inventory_product_id: '',
  inventory_units_per_sale: '1',
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat(brand.currency.locale, {
    style: 'currency',
    currency: brand.currency.code,
    minimumFractionDigits: brand.currency.code === 'COP' ? 0 : 2,
    maximumFractionDigits: brand.currency.code === 'COP' ? 0 : 2,
  }).format(value);
}

function ProductsManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { products, isLoading, error: loadError } = useProducts();
  const { items: inventoryItems } = useInventory();
  const [formError, setFormError] = useState('');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const drinkInventoryItems = useMemo(
    () => inventoryItems.filter((item) => item.category === 'bebidas'),
    [inventoryItems],
  );

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter !== 'all' && product.category !== categoryFilter) return false;
      if (!query) return true;
      const categoryLabel = getMenuCategoryLabel(product.category).toLowerCase();
      const priceLabel = formatPrice(product.price).toLowerCase();
      return (
        product.name.toLowerCase().includes(query) ||
        categoryLabel.includes(query) ||
        priceLabel.includes(query)
      );
    });
  }, [products, categoryFilter, searchQuery]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      mode: FormMode;
      productId?: string;
      body: Record<string, unknown>;
    }) => {
      const url = payload.mode === 'edit' && payload.productId ? `/api/products/${payload.productId}` : '/api/products';
      const method = payload.mode === 'edit' ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products });
      void queryClient.invalidateQueries({ queryKey: queryKeys.menuProducts });
      toast.success(variables.mode === 'create' ? 'Producto creado' : 'Producto actualizado');
      closeForm();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'No se pudo guardar el producto'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products });
      void queryClient.invalidateQueries({ queryKey: queryKeys.menuProducts });
      setConfirmDeleteId(null);
      toast.success('Producto eliminado');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'No se pudo eliminar el producto'),
  });

  function clearFilters() {
    setCategoryFilter('all');
    setSearchQuery('');
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
  }

  function openEditForm(product: CatalogProduct) {
    setFormMode('edit');
    setEditingProduct(product);
    setForm({
      name: product.name,
      price: String(product.price),
      category: product.category,
      active: product.active,
      inventory_product_id: product.inventory_product_id ?? '',
      inventory_units_per_sale: String(product.inventory_units_per_sale ?? 1),
    });
    setFormError('');
  }

  function closeForm() {
    setFormMode(null);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const price = Number(form.price);
    const inventoryBody =
      form.category === 'bebidas'
        ? {
            inventory_product_id: form.inventory_product_id || null,
            inventory_units_per_sale: Number(form.inventory_units_per_sale) || 1,
          }
        : {
            inventory_product_id: null,
            inventory_units_per_sale: 1,
          };

    if (formMode === 'create') {
      saveMutation.mutate({
        mode: 'create',
        body: {
          name: form.name,
          price,
          category: form.category,
          ...inventoryBody,
        },
      });
      return;
    }
    if (formMode === 'edit' && editingProduct) {
      saveMutation.mutate({
        mode: 'edit',
        productId: editingProduct.id,
        body: {
          name: form.name,
          price,
          category: form.category,
          active: form.active,
          ...inventoryBody,
        },
      });
    }
  }

  const displayError =
    formError ||
    (loadError instanceof Error ? loadError.message : loadError ? 'No se pudo cargar el catálogo' : '');

  return (
    <div className="catalog-manager">
      <div className="catalog-manager__toolbar">
        <div className="catalog-manager__toolbar-left">
          <div className="catalog-manager__summary" aria-live="polite">
            <span className="catalog-manager__summary-value">{filteredProducts.length}</span>
            <div className="catalog-manager__summary-copy">
              <span className="catalog-manager__summary-label">
                {filteredProducts.length === 1 ? 'producto' : 'productos'}
              </span>
              {filteredProducts.length !== products.length && (
                <span className="catalog-manager__summary-total">de {products.length} en total</span>
              )}
            </div>
          </div>
          <label className="catalog-manager__search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar productos..."
              aria-label="Buscar productos"
            />
            {searchQuery && (
              <button
                type="button"
                className="catalog-manager__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </label>
          <label className="catalog-manager__filter">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              aria-label="Filtrar por categoría"
            >
              <option value="all">Todas las categorías</option>
              {menuCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="catalog-manager__create" onClick={openCreateForm}>
          <Plus size={18} />
          Nuevo producto
        </button>
      </div>

      {displayError && !formMode && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : products.length === 0 ? (
        <EmptyState
          title="No hay productos en el menú."
          actions={
            <button type="button" className="catalog-manager__create" onClick={openCreateForm}>
              <Plus size={18} />
              Agregar el primero
            </button>
          }
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title={
            searchQuery.trim()
              ? `No se encontraron productos para "${searchQuery.trim()}".`
              : 'No hay productos en esta categoría.'
          }
          actions={
            <button type="button" className="catalog-manager__cancel" onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <div className="catalog-manager__table-wrap">
          <table className="catalog-manager__table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td data-label="Producto">
                    <span className="catalog-manager__name">{product.name}</span>
                    {product.category === 'bebidas' && product.inventory_item_name && (
                      <span className="catalog-manager__inventory-link">
                        Inventario: {product.inventory_item_name}
                        {product.inventory_units_per_sale > 1
                          ? ` (×${product.inventory_units_per_sale})`
                          : ''}
                      </span>
                    )}
                  </td>
                  <td data-label="Categoría">
                    <span className="catalog-manager__badge">
                      {getMenuCategoryLabel(product.category)}
                    </span>
                  </td>
                  <td data-label="Precio">
                    <span className="catalog-manager__price">{formatPrice(product.price)}</span>
                  </td>
                  <td data-label="Acciones">
                    <div className="catalog-manager__actions">
                      <button
                        type="button"
                        className="catalog-manager__action"
                        onClick={() => openEditForm(product)}
                        aria-label={`Editar ${product.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      {confirmDeleteId === product.id ? (
                        <div className="catalog-manager__confirm">
                          <button
                            type="button"
                            className="catalog-manager__confirm-yes"
                            onClick={() => deleteMutation.mutate(product.id)}
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            className="catalog-manager__confirm-no"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="catalog-manager__action catalog-manager__action--danger"
                          onClick={() => setConfirmDeleteId(product.id)}
                          aria-label={`Eliminar ${product.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(formMode)}
        onClose={closeForm}
        title={formMode === 'create' ? 'Nuevo producto del menú' : 'Editar producto'}
        panelClassName="catalog-manager__modal-panel"
        className="catalog-manager__modal"
      >
        <form className="catalog-manager__form" onSubmit={handleSubmit}>
          {formError && <Alert>{formError}</Alert>}

          <div className="catalog-manager__field">
            <label htmlFor="product-name">Nombre</label>
            <input
              id="product-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Ej. Hamburguesa clásica"
              required
              minLength={2}
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="catalog-manager__field">
            <label htmlFor="product-price">Precio ({brand.currency.code})</label>
            <input
              id="product-price"
              type="number"
              step={brand.currency.code === 'COP' ? '1' : '0.01'}
              min="0"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              placeholder="0.00"
              required
              disabled={saveMutation.isPending}
            />
          </div>

          <div className="catalog-manager__field">
            <label htmlFor="product-category">Categoría</label>
            <select
              id="product-category"
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  category: event.target.value,
                  inventory_product_id:
                    event.target.value === 'bebidas' ? prev.inventory_product_id : '',
                }))
              }
              disabled={saveMutation.isPending}
            >
              {menuCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          {form.category === 'bebidas' && (
            <>
              <div className="catalog-manager__field">
                <label htmlFor="product-inventory">Ítem de inventario</label>
                <select
                  id="product-inventory"
                  value={form.inventory_product_id}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inventory_product_id: event.target.value }))
                  }
                  disabled={saveMutation.isPending}
                >
                  <option value="">Sin vínculo (no descuenta stock)</option>
                  {drinkInventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.stock} {getInventoryUnitLabel(item.unit).toLowerCase()} (
                      {getInventoryCategoryLabel(item.category)})
                    </option>
                  ))}
                </select>
              </div>

              {form.inventory_product_id && (
                <div className="catalog-manager__field">
                  <label htmlFor="product-inventory-units">Unidades de inventario por venta</label>
                  <input
                    id="product-inventory-units"
                    type="number"
                    min="1"
                    step="1"
                    value={form.inventory_units_per_sale}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        inventory_units_per_sale: event.target.value,
                      }))
                    }
                    disabled={saveMutation.isPending}
                  />
                </div>
              )}
            </>
          )}

          {formMode === 'edit' && (
            <label className="catalog-manager__checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                disabled={saveMutation.isPending}
              />
              <span>Visible en comandas</span>
            </label>
          )}

          <div className="catalog-manager__form-actions">
            <button
              type="button"
              className="catalog-manager__cancel"
              onClick={closeForm}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </button>
            <button type="submit" className="catalog-manager__submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 size={16} className="catalog-manager__spinner" />
                  Guardando...
                </>
              ) : formMode === 'create' ? (
                'Crear producto'
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default withAppProviders(ProductsManager);
