import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  User,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import MultiCurrencyPrice from '@/components/ui/MultiCurrencyPrice';
import { Alert, EmptyState, SkeletonGrid } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import { parseError } from '@/lib/api/parseError';
import type { OrderListItem } from '@/lib/db/orders';
import type { OrderStatus } from '@/lib/db/types';
import { isDeliveryReadyForDispatch, openDeliveryReadyWhatsApp } from '@/lib/delivery/whatsapp';
import { useDeliveryOrders } from '@/lib/hooks/queries/useDeliveryOrders';
import { useExchangeRates } from '@/lib/hooks/queries/useExchangeRates';
import { formatOrderLabel } from '@/lib/orders/display';
import {
  canMarkOrderDelivered,
  canPayOrder,
  DELIVERY_PAYMENT_TIMING_LABELS,
  getDeliveryPaymentTiming,
  type DeliveryPaymentTiming,
} from '@/lib/orders/delivery-flow';
import { DELIVERY_FILTER_OPTIONS, STATUS_LABELS } from '@/lib/orders/labels';
import { panelNavigate } from '@/lib/navigation/panelNavigate';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { formatShortDateTime } from '@/lib/utils/datetime';

import '@/components/delivery/DeliveryManager.css';

type StatusFilter = OrderStatus | 'all';

type DeliveryForm = {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes: string;
  delivery_payment_timing: DeliveryPaymentTiming;
};

type DeliveryManagerProps = {
  variant?: 'full' | 'dashboard';
};

const EMPTY_FORM: DeliveryForm = {
  customer_name: '',
  customer_phone: '',
  delivery_address: '',
  delivery_notes: '',
  delivery_payment_timing: 'on_delivery',
};

const STATUS_PRIORITY: Record<OrderStatus, number> = {
  listo: 0,
  cocina: 1,
  pendiente: 2,
  pagado: 3,
  entregado: 4,
  cancelado: 5,
};

function DeliveryManager({ variant = 'full' }: DeliveryManagerProps) {
  const queryClient = useQueryClient();
  const { rates } = useExchangeRates();
  const { orders, isLoading, error } = useDeliveryOrders();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DeliveryForm>(EMPTY_FORM);

  const readyCount = useMemo(
    () => orders.filter((order) => order.status === 'listo').length,
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const list =
      statusFilter === 'all' ? orders : orders.filter((order) => order.status === statusFilter);

    return [...list].sort((a, b) => {
      const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (byStatus !== 0) return byStatus;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [orders, statusFilter]);

  const createMutation = useMutation({
    mutationFn: async (payload: DeliveryForm) => {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_type: 'delivery', ...payload }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      return response.json() as Promise<{ order: { id: string } }>;
    },
    onSuccess: (data) => {
      void panelNavigate(`/panel/comandas/${data.order.id}`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo crear el domicilio');
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'entregado' }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      return orderId;
    },
    onMutate: (orderId) => {
      setActingId(orderId);
      setActionError('');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo marcar como entregado');
    },
    onSettled: () => setActingId(null),
  });

  function notifyCustomer(order: OrderListItem, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!openDeliveryReadyWhatsApp(order)) {
      setActionError('No se pudo abrir WhatsApp. Verifica el teléfono del cliente.');
    }
  }

  const displayError =
    actionError ||
    (error instanceof Error ? error.message : error ? 'No se pudieron cargar los domicilios' : '');

  return (
    <div className="delivery-manager">
      <div className="delivery-manager__toolbar">
        <div className="delivery-manager__filters" aria-label="Filtrar por estado">
          {DELIVERY_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`delivery-manager__filter ${statusFilter === option.id ? 'delivery-manager__filter--active' : ''}`}
              onClick={() => setStatusFilter(option.id)}
            >
              {option.label}
              {option.id === 'listo' && readyCount > 0 && (
                <span className="delivery-manager__filter-badge">{readyCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="delivery-manager__actions">
          <div className="delivery-manager__summary">
            <span className="delivery-manager__summary-value">{filteredOrders.length}</span>
            <span className="delivery-manager__summary-label">domicilios</span>
          </div>

          <button
            type="button"
            className="delivery-manager__btn delivery-manager__btn--primary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowForm(true);
            }}
          >
            <Plus size={16} />
            Nuevo domicilio
          </button>

          {variant === 'dashboard' && (
            <a href="/panel/domicilios" className="delivery-manager__btn delivery-manager__btn--ghost">
              Ver todos
            </a>
          )}
        </div>
      </div>

      {displayError && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonGrid count={6} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<Bike size={28} />}
          title={
            statusFilter === 'all'
              ? 'No hay domicilios activos. Crea uno para empezar a tomar el pedido.'
              : `No hay domicilios en estado "${STATUS_LABELS[statusFilter as OrderStatus]}".`
          }
          actions={
            <button
              type="button"
              className="delivery-manager__btn delivery-manager__btn--primary"
              onClick={() => setShowForm(true)}
            >
              <Plus size={16} />
              Nuevo domicilio
            </button>
          }
        />
      ) : (
        <div className="delivery-manager__grid">
          {filteredOrders.map((order) => (
            <a
              key={order.id}
              href={`/panel/comandas/${order.id}`}
              className={`delivery-manager__card ${order.status === 'listo' ? 'delivery-manager__card--ready' : ''}`}
            >
              <div className="delivery-manager__card-header">
                <h2 className="delivery-manager__card-title">{formatOrderLabel(order)}</h2>
                <span className={`delivery-manager__status delivery-manager__status--${order.status}`}>
                  {STATUS_LABELS[order.status]}
                </span>
                {order.order_type === 'delivery' && (
                  <span className="delivery-manager__timing">
                    {DELIVERY_PAYMENT_TIMING_LABELS[getDeliveryPaymentTiming(order)]}
                  </span>
                )}
              </div>

              <div className="delivery-manager__card-meta">
                {order.customer_phone && (
                  <span>
                    <Phone size={14} />
                    {order.customer_phone}
                  </span>
                )}
                {order.delivery_address && (
                  <span>
                    <MapPin size={14} />
                    {order.delivery_address}
                  </span>
                )}
                <span>
                  <User size={14} />
                  {order.username}
                </span>
                <span>
                  <ClipboardList size={14} />
                  {order.item_count} producto{order.item_count === 1 ? '' : 's'}
                </span>
                <span>Actualizado {formatShortDateTime(order.updated_at)}</span>
              </div>

              <div className="delivery-manager__card-footer">
                <MultiCurrencyPrice
                  amountCop={order.total}
                  rates={rates}
                  align="right"
                  className="delivery-manager__card-total"
                />
                <div className="delivery-manager__card-actions">
                  {isDeliveryReadyForDispatch(order) && (
                    <button
                      type="button"
                      className="delivery-manager__whatsapp-btn"
                      onClick={(event) => notifyCustomer(order, event)}
                    >
                      <MessageCircle size={14} />
                      Avisar por WhatsApp
                    </button>
                  )}
                  {canMarkOrderDelivered(order) ? (
                    <button
                      type="button"
                      className="delivery-manager__deliver-btn"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        markDeliveredMutation.mutate(order.id);
                      }}
                      disabled={actingId === order.id}
                    >
                      {actingId === order.id ? (
                        <Loader2 className="delivery-manager__spin" size={14} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      Entregar
                    </button>
                  ) : canPayOrder(order) ? (
                    <span className="delivery-manager__card-action delivery-manager__card-action--pay">
                      Facturar en caja →
                    </span>
                  ) : (
                    <span className="delivery-manager__card-action">Ver pedido →</span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nuevo domicilio"
        panelClassName="delivery-manager__modal"
        className="delivery-manager__overlay"
      >
        <form
          className="delivery-manager__form"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
        >
          <div className="delivery-manager__form-body">
            <label className="delivery-manager__label">
              Nombre del cliente
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                className="delivery-manager__input"
                required
                autoFocus
              />
            </label>

            <label className="delivery-manager__label">
              Teléfono
              <input
                type="tel"
                value={form.customer_phone}
                onChange={(e) => setForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                className="delivery-manager__input"
                required
              />
            </label>

            <label className="delivery-manager__label">
              Dirección de entrega
              <textarea
                value={form.delivery_address}
                onChange={(e) => setForm((prev) => ({ ...prev, delivery_address: e.target.value }))}
                className="delivery-manager__textarea"
                rows={3}
                required
              />
            </label>

            <label className="delivery-manager__label">
              Notas de entrega (opcional)
              <textarea
                value={form.delivery_notes}
                onChange={(e) => setForm((prev) => ({ ...prev, delivery_notes: e.target.value }))}
                className="delivery-manager__textarea"
                rows={2}
                placeholder="Torre, apartamento, referencias…"
              />
            </label>

            <fieldset className="delivery-manager__timing-fieldset">
              <legend className="delivery-manager__label">Forma de pago</legend>
              {(['on_delivery', 'prepaid'] as const).map((timing) => (
                <label key={timing} className="delivery-manager__timing-option">
                  <input
                    type="radio"
                    name="delivery_payment_timing"
                    value={timing}
                    checked={form.delivery_payment_timing === timing}
                    onChange={() =>
                      setForm((prev) => ({ ...prev, delivery_payment_timing: timing }))
                    }
                  />
                  <span>
                    <strong>{DELIVERY_PAYMENT_TIMING_LABELS[timing]}</strong>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>

          <footer className="delivery-manager__modal-footer">
            <button
              type="button"
              className="delivery-manager__btn delivery-manager__btn--ghost"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="delivery-manager__btn delivery-manager__btn--primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="delivery-manager__spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              Crear y tomar pedido
            </button>
          </footer>
        </form>
      </Modal>
    </div>
  );
}

export default withAppProviders(DeliveryManager);
