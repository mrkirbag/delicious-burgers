import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getInventoryCategoryLabel,
  getInventoryUnitLabel,
  inventoryCategories,
  inventoryUnits,
} from '@/data/product-categories';
import { useToast } from '@/components/providers/ToastProvider';
import { Alert, EmptyState, SkeletonTable } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import { parseError } from '@/lib/api/parseError';
import type { InventoryItem } from '@/lib/db/inventory';
import { useInventory, useInventoryMovements } from '@/lib/hooks/queries/useInventory';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';

import './InventoryManager.css';

type FormMode = 'create' | 'edit' | 'movement' | 'history';

type CategoryFilter = string | 'all';

type ItemFormState = {
  name: string;
  category: string;
  unit: string;
  stock: string;
  min_stock: string;
};

type MovementFormState = {
  type: 'entrada' | 'salida';
  quantity: string;
  reason: string;
};

const emptyItemForm: ItemFormState = {
  name: '',
  category: inventoryCategories[0]?.id ?? 'bebidas',
  unit: inventoryUnits[0]?.id ?? 'cajas',
  stock: '0',
  min_stock: '5',
};

const emptyMovementForm: MovementFormState = {
  type: 'entrada',
  quantity: '1',
  reason: '',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function InventoryManager() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { items, isLoading, error: loadError } = useInventory();
  const [formError, setFormError] = useState('');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm);
  const [movementForm, setMovementForm] = useState<MovementFormState>(emptyMovementForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const historyItemId = formMode === 'history' && selectedItem ? selectedItem.id : null;
  const { movements, isLoading: loadingMovements } = useInventoryMovements(historyItemId);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!query) return true;

      const categoryLabel = getInventoryCategoryLabel(item.category).toLowerCase();
      const unitLabel = getInventoryUnitLabel(item.unit).toLowerCase();

      return (
        item.name.toLowerCase().includes(query) ||
        categoryLabel.includes(query) ||
        unitLabel.includes(query) ||
        String(item.stock).includes(query) ||
        String(item.min_stock).includes(query)
      );
    });
  }, [items, categoryFilter, searchQuery]);

  const saveItemMutation = useMutation({
    mutationFn: async (payload: {
      mode: 'create' | 'edit';
      itemId?: string;
      body: Record<string, unknown>;
    }) => {
      const url =
        payload.mode === 'edit' && payload.itemId
          ? `/api/inventory/${payload.itemId}`
          : '/api/inventory';
      const method = payload.mode === 'edit' ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
      toast.success(variables.mode === 'create' ? 'Ítem creado' : 'Ítem actualizado');
      closeForm();
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el ítem'),
  });

  const movementMutation = useMutation({
    mutationFn: async (payload: { itemId: string; body: Record<string, unknown> }) => {
      const response = await fetch(`/api/inventory/${payload.itemId}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
      toast.success('Movimiento registrado');
      closeForm();
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`/api/inventory/${itemId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory });
      setConfirmDeleteId(null);
      toast.success('Ítem eliminado');
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : 'No se pudo eliminar el ítem'),
  });

  function clearFilters() {
    setCategoryFilter('all');
    setSearchQuery('');
  }

  function closeForm() {
    setFormMode(null);
    setSelectedItem(null);
    setItemForm(emptyItemForm);
    setMovementForm(emptyMovementForm);
    setFormError('');
  }

  function openCreateForm() {
    setFormMode('create');
    setSelectedItem(null);
    setItemForm(emptyItemForm);
    setFormError('');
  }

  function openEditForm(item: InventoryItem) {
    setFormMode('edit');
    setSelectedItem(item);
    setItemForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      stock: String(item.stock),
      min_stock: String(item.min_stock),
    });
    setFormError('');
  }

  function openMovementForm(item: InventoryItem, type: 'entrada' | 'salida') {
    setFormMode('movement');
    setSelectedItem(item);
    setMovementForm({ ...emptyMovementForm, type });
    setFormError('');
  }

  function openHistory(item: InventoryItem) {
    setFormMode('history');
    setSelectedItem(item);
    setFormError('');
  }

  function handleItemSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (formMode === 'create') {
      saveItemMutation.mutate({
        mode: 'create',
        body: {
          name: itemForm.name,
          category: itemForm.category,
          unit: itemForm.unit,
          stock: Number(itemForm.stock),
          min_stock: Number(itemForm.min_stock),
        },
      });
      return;
    }

    if (formMode === 'edit' && selectedItem) {
      saveItemMutation.mutate({
        mode: 'edit',
        itemId: selectedItem.id,
        body: {
          name: itemForm.name,
          category: itemForm.category,
          unit: itemForm.unit,
          min_stock: Number(itemForm.min_stock),
        },
      });
    }
  }

  function handleMovementSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    setFormError('');

    movementMutation.mutate({
      itemId: selectedItem.id,
      body: {
        type: movementForm.type,
        quantity: Number(movementForm.quantity),
        reason: movementForm.reason || undefined,
      },
    });
  }

  const displayError =
    formError ||
    (loadError instanceof Error ? loadError.message : loadError ? 'No se pudo cargar el inventario' : '');

  const isSaving = saveItemMutation.isPending || movementMutation.isPending;

  return (
    <div className="inventory-manager">
      <div className="inventory-manager__toolbar">
        <div className="inventory-manager__toolbar-left">
          <div className="inventory-manager__summary" aria-live="polite">
            <span className="inventory-manager__summary-value">{filteredItems.length}</span>
            <div className="inventory-manager__summary-copy">
              <span className="inventory-manager__summary-label">
                {filteredItems.length === 1 ? 'ítem' : 'ítems'}
              </span>
              {filteredItems.length !== items.length && (
                <span className="inventory-manager__summary-total">de {items.length} en total</span>
              )}
            </div>
          </div>

          <label className="inventory-manager__search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar ítems..."
              aria-label="Buscar ítems de inventario"
            />
            {searchQuery && (
              <button
                type="button"
                className="inventory-manager__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </label>

          <label className="inventory-manager__filter">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              aria-label="Filtrar por categoría"
            >
              <option value="all">Todas las categorías</option>
              {inventoryCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="inventory-manager__create" onClick={openCreateForm}>
          <Plus size={18} />
          Nuevo ítem
        </button>
      </div>

      {displayError && !formMode && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay ítems de inventario registrados."
          actions={
            <button type="button" className="inventory-manager__create" onClick={openCreateForm}>
              <Plus size={18} />
              Registrar el primero
            </button>
          }
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={
            searchQuery.trim()
              ? `No se encontraron ítems para "${searchQuery.trim()}".`
              : 'No hay ítems en esta categoría.'
          }
          actions={
            <button type="button" className="inventory-manager__cancel" onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <div className="inventory-manager__table-wrap">
          <table className="inventory-manager__table">
            <thead>
              <tr>
                <th>Ítem</th>
                <th>Categoría</th>
                <th>Stock</th>
                <th>Mínimo</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td data-label="Ítem">
                    <span className="inventory-manager__name">{item.name}</span>
                    <span className="inventory-manager__unit">{getInventoryUnitLabel(item.unit)}</span>
                  </td>
                  <td data-label="Categoría">
                    <span className="inventory-manager__badge">
                      {getInventoryCategoryLabel(item.category)}
                    </span>
                  </td>
                  <td data-label="Stock">
                    <span className="inventory-manager__stock">
                      {item.stock} {getInventoryUnitLabel(item.unit).toLowerCase()}
                    </span>
                  </td>
                  <td data-label="Mínimo">{item.min_stock}</td>
                  <td data-label="Acciones">
                    <div className="inventory-manager__actions">
                      <button
                        type="button"
                        className="inventory-manager__action inventory-manager__action--entry"
                        onClick={() => openMovementForm(item, 'entrada')}
                        aria-label={`Entrada de ${item.name}`}
                        title="Registrar entrada"
                      >
                        <ArrowDownCircle size={16} />
                      </button>
                      <button
                        type="button"
                        className="inventory-manager__action inventory-manager__action--exit"
                        onClick={() => openMovementForm(item, 'salida')}
                        aria-label={`Salida de ${item.name}`}
                        title="Registrar salida"
                      >
                        <ArrowUpCircle size={16} />
                      </button>
                      <button
                        type="button"
                        className="inventory-manager__action"
                        onClick={() => openHistory(item)}
                        aria-label={`Historial de ${item.name}`}
                        title="Ver historial"
                      >
                        <History size={16} />
                      </button>
                      <button
                        type="button"
                        className="inventory-manager__action"
                        onClick={() => openEditForm(item)}
                        aria-label={`Editar ${item.name}`}
                      >
                        <Pencil size={16} />
                      </button>

                      {confirmDeleteId === item.id ? (
                        <div className="inventory-manager__confirm">
                          <button
                            type="button"
                            className="inventory-manager__confirm-yes"
                            onClick={() => deleteMutation.mutate(item.id)}
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            className="inventory-manager__confirm-no"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inventory-manager__action inventory-manager__action--danger"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label={`Eliminar ${item.name}`}
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
        open={formMode === 'create' || formMode === 'edit'}
        onClose={closeForm}
        title={formMode === 'create' ? 'Nuevo ítem de inventario' : 'Editar ítem'}
        panelClassName="inventory-manager__modal-panel"
        className="inventory-manager__modal"
      >
        <form className="inventory-manager__form" onSubmit={handleItemSubmit}>
          {formError && <Alert>{formError}</Alert>}

          <div className="inventory-manager__field">
            <label htmlFor="item-name">Nombre</label>
            <input
              id="item-name"
              type="text"
              value={itemForm.name}
              onChange={(event) => setItemForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Ej. Caja Coca-Cola 355ml"
              required
              minLength={2}
              disabled={isSaving}
            />
          </div>

          <div className="inventory-manager__field-row">
            <div className="inventory-manager__field">
              <label htmlFor="item-category">Categoría</label>
              <select
                id="item-category"
                value={itemForm.category}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, category: event.target.value }))
                }
                disabled={isSaving}
              >
                {inventoryCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="inventory-manager__field">
              <label htmlFor="item-unit">Unidad</label>
              <select
                id="item-unit"
                value={itemForm.unit}
                onChange={(event) => setItemForm((prev) => ({ ...prev, unit: event.target.value }))}
                disabled={isSaving}
              >
                {inventoryUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formMode === 'create' && (
            <div className="inventory-manager__field">
              <label htmlFor="item-stock">Stock inicial</label>
              <input
                id="item-stock"
                type="number"
                min="0"
                step="1"
                value={itemForm.stock}
                onChange={(event) => setItemForm((prev) => ({ ...prev, stock: event.target.value }))}
                disabled={isSaving}
              />
            </div>
          )}

          <div className="inventory-manager__field">
            <label htmlFor="item-min-stock">Stock mínimo (alerta)</label>
            <input
              id="item-min-stock"
              type="number"
              min="0"
              step="1"
              value={itemForm.min_stock}
              onChange={(event) =>
                setItemForm((prev) => ({ ...prev, min_stock: event.target.value }))
              }
              disabled={isSaving}
            />
          </div>

          <div className="inventory-manager__form-actions">
            <button type="button" className="inventory-manager__cancel" onClick={closeForm} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="inventory-manager__submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 size={16} className="inventory-manager__spinner" />
                  Guardando...
                </>
              ) : formMode === 'create' ? (
                'Crear ítem'
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={formMode === 'movement' && Boolean(selectedItem)}
        onClose={closeForm}
        title={movementForm.type === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}
        panelClassName="inventory-manager__modal-panel"
        className="inventory-manager__modal"
      >
        {selectedItem && (
          <form className="inventory-manager__form" onSubmit={handleMovementSubmit}>
            {formError && <Alert>{formError}</Alert>}

            <p className="inventory-manager__movement-target">
              <strong>{selectedItem.name}</strong>
              <span>
                Stock actual: {selectedItem.stock}{' '}
                {getInventoryUnitLabel(selectedItem.unit).toLowerCase()}
              </span>
            </p>

            <div className="inventory-manager__field">
              <label htmlFor="movement-type">Tipo</label>
              <select
                id="movement-type"
                value={movementForm.type}
                onChange={(event) =>
                  setMovementForm((prev) => ({
                    ...prev,
                    type: event.target.value as 'entrada' | 'salida',
                  }))
                }
                disabled={movementMutation.isPending}
              >
                <option value="entrada">Entrada (compra, reposición)</option>
                <option value="salida">Salida (uso, merma, rotura)</option>
              </select>
            </div>

            <div className="inventory-manager__field">
              <label htmlFor="movement-quantity">Cantidad</label>
              <input
                id="movement-quantity"
                type="number"
                min="1"
                step="1"
                value={movementForm.quantity}
                onChange={(event) =>
                  setMovementForm((prev) => ({ ...prev, quantity: event.target.value }))
                }
                required
                disabled={movementMutation.isPending}
              />
            </div>

            <div className="inventory-manager__field">
              <label htmlFor="movement-reason">Motivo (opcional)</label>
              <input
                id="movement-reason"
                type="text"
                value={movementForm.reason}
                onChange={(event) =>
                  setMovementForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder="Ej. Compra semanal, uso en cocina"
                disabled={movementMutation.isPending}
              />
            </div>

            <div className="inventory-manager__form-actions">
              <button
                type="button"
                className="inventory-manager__cancel"
                onClick={closeForm}
                disabled={movementMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inventory-manager__submit"
                disabled={movementMutation.isPending}
              >
                {movementMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="inventory-manager__spinner" />
                    Registrando...
                  </>
                ) : (
                  'Registrar movimiento'
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={formMode === 'history' && Boolean(selectedItem)}
        onClose={closeForm}
        title={selectedItem ? `Historial — ${selectedItem.name}` : 'Historial'}
        panelClassName="inventory-manager__modal-panel inventory-manager__modal-panel--wide"
        className="inventory-manager__modal"
      >
        <div className="inventory-manager__history">
          {loadingMovements ? (
            <SkeletonTable rows={4} />
          ) : movements.length === 0 ? (
            <p className="inventory-manager__history-empty">Sin movimientos registrados.</p>
          ) : (
            <ul className="inventory-manager__history-list">
              {movements.map((movement) => (
                <li key={movement.id} className="inventory-manager__history-item">
                  <div
                    className={`inventory-manager__history-type inventory-manager__history-type--${movement.type}`}
                  >
                    {movement.type === 'entrada' ? '+' : '−'}
                    {movement.quantity}
                  </div>
                  <div className="inventory-manager__history-copy">
                    <span>
                      {movement.type === 'entrada' ? 'Entrada' : 'Salida'}
                      {movement.reason ? ` — ${movement.reason}` : ''}
                    </span>
                    <span>
                      {movement.username} · {formatDate(movement.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default withAppProviders(InventoryManager);
