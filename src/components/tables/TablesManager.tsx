import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Alert, EmptyState, SkeletonGrid } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import { parseError } from '@/lib/api/parseError';
import type { TableStatus } from '@/lib/db/types';
import type { TableWithActiveOrder } from '@/lib/db/tables';
import { useTables } from '@/lib/hooks/queries/useTables';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { panelNavigate } from '@/lib/navigation/panelNavigate';

import './TablesManager.css';

type FormMode = 'create' | 'edit';

type TableFormState = {
  number: string;
  capacity: string;
};

type TablesManagerProps = {
  isAdmin?: boolean;
  variant?: 'full' | 'dashboard';
};

const STATUS_LABELS: Record<TableStatus, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  limpieza: 'Limpieza',
};

const emptyForm: TableFormState = {
  number: '',
  capacity: '4',
};

function TablesManager({ isAdmin = false, variant = 'full' }: TablesManagerProps) {
  const queryClient = useQueryClient();
  const showAdminTools = isAdmin && variant === 'full';
  const { tables, isLoading, error } = useTables();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingTable, setEditingTable] = useState<TableWithActiveOrder | null>(null);
  const [form, setForm] = useState<TableFormState>(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    return tables.reduce(
      (acc, table) => {
        acc[table.status] += 1;
        return acc;
      },
      { libre: 0, ocupada: 0, limpieza: 0 } as Record<TableStatus, number>,
    );
  }, [tables]);

  const saveMutation = useMutation({
    mutationFn: async ({
      mode,
      tableId,
      payload,
    }: {
      mode: FormMode;
      tableId?: string;
      payload: { number: string; capacity: number };
    }) => {
      const url = mode === 'edit' && tableId ? `/api/tables/${tableId}` : '/api/tables';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      closeForm();
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar la mesa');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tables/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onSuccess: () => {
      closeForm();
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo eliminar la mesa');
    },
  });

  const openOrderMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      return response.json() as Promise<{ order: { id: string } }>;
    },
    onMutate: (tableId) => {
      setActingId(tableId);
      setActionError('');
    },
    onSuccess: (data) => {
      void panelNavigate(`/panel/comandas/${data.order.id}`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo abrir la comanda');
    },
    onSettled: () => setActingId(null),
  });

  const markFreeMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'libre' }),
      });
      if (!response.ok) throw new Error(await parseError(response));
    },
    onMutate: (tableId) => {
      setActingId(tableId);
      setActionError('');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo actualizar la mesa');
    },
    onSettled: () => setActingId(null),
  });

  function openCreateForm() {
    setFormMode('create');
    setEditingTable(null);
    setForm(emptyForm);
    setActionError('');
  }

  function openEditForm(table: TableWithActiveOrder, event: React.MouseEvent) {
    event.stopPropagation();
    setFormMode('edit');
    setEditingTable(table);
    setForm({ number: table.number, capacity: String(table.capacity) });
    setActionError('');
  }

  function closeForm() {
    setFormMode(null);
    setEditingTable(null);
    setForm(emptyForm);
    setConfirmDeleteId(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    saveMutation.mutate({
      mode: formMode ?? 'create',
      tableId: editingTable?.id,
      payload: { number: form.number.trim(), capacity: Number(form.capacity) },
    });
  }

  function handleTableClick(table: TableWithActiveOrder) {
    if (actingId) return;

    if (table.status === 'libre') {
      openOrderMutation.mutate(table.id);
      return;
    }

    if (table.status === 'ocupada') {
      if (table.active_order_id) {
        void panelNavigate(`/panel/comandas/${table.active_order_id}`);
      } else {
        setActionError(`La mesa ${table.number} está ocupada pero no tiene comanda activa`);
      }
      return;
    }

    if (table.status === 'limpieza') {
      markFreeMutation.mutate(table.id);
    }
  }

  function handleDeleteClick(table: TableWithActiveOrder, event: React.MouseEvent) {
    event.stopPropagation();
    setConfirmDeleteId(table.id);
    setEditingTable(table);
  }

  const displayError =
    actionError ||
    (error instanceof Error ? error.message : error ? 'No se pudieron cargar las mesas' : '');

  const saving = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="tables-manager">
      <div className="tables-manager__toolbar">
        <div className="tables-manager__legend" aria-label="Estados de mesa">
          {(Object.keys(STATUS_LABELS) as TableStatus[]).map((status) => (
            <span key={status} className="tables-manager__legend-item">
              <span className={`tables-manager__legend-dot tables-manager__legend-dot--${status}`} />
              {STATUS_LABELS[status]} ({statusCounts[status]})
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="tables-manager__summary">
            <span className="tables-manager__summary-value">{tables.length}</span>
            <div className="tables-manager__summary-copy">
              <span className="tables-manager__summary-label">Mesas</span>
              <span className="tables-manager__summary-total">en el local</span>
            </div>
          </div>

          {showAdminTools && (
            <button type="button" className="tables-manager__btn" onClick={openCreateForm}>
              <Plus size={16} />
              Nueva mesa
            </button>
          )}

          {variant === 'dashboard' && isAdmin && (
            <a href="/panel/mesas" className="tables-manager__btn tables-manager__btn--ghost">
              Administrar mesas
            </a>
          )}
        </div>
      </div>

      {displayError && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonGrid count={8} />
      ) : tables.length === 0 ? (
        <EmptyState
          title="No hay mesas configuradas."
          actions={
            showAdminTools ? (
              <button type="button" className="tables-manager__btn" onClick={openCreateForm}>
                <Plus size={16} />
                Crear primera mesa
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="tables-manager__grid">
          {tables.map((table) => {
            const isActing = actingId === table.id;

            return (
              <div
                key={table.id}
                role="button"
                tabIndex={0}
                className={`tables-manager__card tables-manager__card--${table.status}`}
                onClick={() => handleTableClick(table)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleTableClick(table);
                  }
                }}
                aria-disabled={isActing}
                aria-label={`Mesa ${table.number}, ${STATUS_LABELS[table.status]}`}
                style={isActing ? { opacity: 0.7, pointerEvents: 'none' } : undefined}
              >
                {showAdminTools && (
                  <div className="tables-manager__card-actions">
                    <button
                      type="button"
                      className="tables-manager__icon-btn"
                      onClick={(event) => openEditForm(table, event)}
                      aria-label={`Editar mesa ${table.number}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="tables-manager__icon-btn"
                      onClick={(event) => handleDeleteClick(table, event)}
                      aria-label={`Eliminar mesa ${table.number}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                <span className="tables-manager__card-number">{table.number}</span>
                <span className="tables-manager__card-label">{STATUS_LABELS[table.status]}</span>
                <span className="tables-manager__card-capacity">
                  <Users size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {table.capacity}{' '}
                  personas
                </span>
                {isActing && (
                  <span className="tables-manager__card-hint">Procesando…</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdminTools && formMode && (
        <Modal
          open
          onClose={closeForm}
          title={formMode === 'create' ? 'Nueva mesa' : 'Editar mesa'}
          panelClassName="tables-manager__modal"
          className="tables-manager__modal-backdrop"
        >
          <form className="tables-manager__form" onSubmit={handleSubmit}>
            <div className="tables-manager__field">
              <label htmlFor="table-number">Número</label>
              <input
                id="table-number"
                type="text"
                value={form.number}
                onChange={(event) => setForm((prev) => ({ ...prev, number: event.target.value }))}
                required
                autoFocus
              />
            </div>

            <div className="tables-manager__field">
              <label htmlFor="table-capacity">Capacidad</label>
              <input
                id="table-capacity"
                type="number"
                min={1}
                max={50}
                value={form.capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
                required
              />
            </div>

            <div className="tables-manager__modal-actions">
              <button type="button" className="tables-manager__btn tables-manager__btn--ghost" onClick={closeForm}>
                Cancelar
              </button>
              <button type="submit" className="tables-manager__btn" disabled={saving}>
                {saving ? <Loader2 className="tables-manager__spin" size={16} /> : null}
                {formMode === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showAdminTools && confirmDeleteId && editingTable && (
        <Modal
          open
          onClose={closeForm}
          title={`Eliminar mesa ${editingTable.number}`}
          panelClassName="tables-manager__modal"
          className="tables-manager__modal-backdrop"
        >
          <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Esta acción no se puede deshacer. Solo se puede eliminar si no tiene comandas activas.
          </p>

          <div className="tables-manager__modal-actions">
            <button type="button" className="tables-manager__btn tables-manager__btn--ghost" onClick={closeForm}>
              Cancelar
            </button>
            <button
              type="button"
              className="tables-manager__btn tables-manager__btn--danger"
              disabled={saving}
              onClick={() => deleteMutation.mutate(confirmDeleteId)}
            >
              {saving ? <Loader2 className="tables-manager__spin" size={16} /> : null}
              Eliminar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default withAppProviders(TablesManager);
