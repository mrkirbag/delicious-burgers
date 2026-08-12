import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, CheckCircle2, ClipboardList, Loader2, User, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';

import MultiCurrencyPrice from '@/components/ui/MultiCurrencyPrice';
import { Alert, EmptyState, SkeletonGrid } from '@/components/ui/Feedback';
import { parseError } from '@/lib/api/parseError';
import type { OrderStatus } from '@/lib/db/types';
import { useExchangeRates } from '@/lib/hooks/queries/useExchangeRates';
import { useOrders } from '@/lib/hooks/queries/useOrders';
import { formatOrderLabel } from '@/lib/orders/display';
import { canMarkOrderDelivered, canPayOrder } from '@/lib/orders/delivery-flow';
import { ACTIVE_ORDER_FILTER_OPTIONS, STATUS_LABELS } from '@/lib/orders/labels';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { formatShortDateTime } from '@/lib/utils/datetime';

import './OrdersList.css';

type StatusFilter = OrderStatus | 'all';

function OrdersList() {
  const queryClient = useQueryClient();
  const { rates } = useExchangeRates();
  const { orders, isLoading, error } = useOrders();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter((order) => order.status === statusFilter);
  }, [orders, statusFilter]);

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo marcar como entregado');
    },
    onSettled: () => setActingId(null),
  });

  const displayError =
    actionError || (error instanceof Error ? error.message : error ? 'No se pudieron cargar las comandas' : '');

  return (
    <div className="orders-list">
      <div className="orders-list__toolbar">
        <div className="orders-list__filters" aria-label="Filtrar por estado">
          {ACTIVE_ORDER_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`orders-list__filter ${statusFilter === option.id ? 'orders-list__filter--active' : ''}`}
              onClick={() => setStatusFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="orders-list__summary">
            <span className="orders-list__summary-value">{filteredOrders.length}</span>
            <span className="orders-list__summary-label">comandas</span>
          </div>
          <a href="/panel/mesas" className="orders-list__link-mesas">
            <UtensilsCrossed size={16} />
            Mesas
          </a>
          <a href="/panel/domicilios" className="orders-list__link-mesas orders-list__link-mesas--secondary">
            <Bike size={16} />
            Domicilios
          </a>
        </div>
      </div>

      {displayError && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonGrid count={6} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title={
            statusFilter === 'all'
              ? 'No hay comandas activas. Abre una mesa o crea un domicilio para comenzar.'
              : `No hay comandas en estado "${STATUS_LABELS[statusFilter as OrderStatus]}".`
          }
          actions={
            <div className="orders-list__empty-actions">
              <a href="/panel/mesas" className="orders-list__link-mesas">
                <UtensilsCrossed size={16} />
                Abrir mesa
              </a>
              <a href="/panel/domicilios" className="orders-list__link-mesas orders-list__link-mesas--secondary">
                <Bike size={16} />
                Nuevo domicilio
              </a>
            </div>
          }
        />
      ) : (
        <div className="orders-list__grid">
          {filteredOrders.map((order) => (
            <a
              key={order.id}
              href={`/panel/comandas/${order.id}`}
              className={`orders-list__card ${order.status === 'listo' ? 'orders-list__card--ready' : ''}`}
            >
              <div className="orders-list__card-header">
                <h2 className="orders-list__card-table">{formatOrderLabel(order)}</h2>
                <span className={`orders-list__status orders-list__status--${order.status}`}>
                  {STATUS_LABELS[order.status]}
                </span>
              </div>

              <div className="orders-list__card-meta">
                <span>
                  <User size={14} />
                  {order.username}
                </span>
                <span>
                  <ClipboardList size={14} />
                  {order.item_count} producto{order.item_count === 1 ? '' : 's'}
                </span>
                <span>Actualizada {formatShortDateTime(order.updated_at)}</span>
              </div>

              <div className="orders-list__card-footer">
                <MultiCurrencyPrice
                  amountCop={order.total}
                  rates={rates}
                  align="right"
                  className="orders-list__card-total"
                />
                {canMarkOrderDelivered(order) ? (
                  <button
                    type="button"
                    className="orders-list__deliver-btn"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      markDeliveredMutation.mutate(order.id);
                    }}
                    disabled={actingId === order.id}
                  >
                    {actingId === order.id ? (
                      <Loader2 className="orders-list__spin" size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Entregar
                  </button>
                ) : canPayOrder(order) ? (
                  <span className="orders-list__card-action orders-list__card-action--pay">
                    Cobrar en caja →
                  </span>
                ) : (
                  <span className="orders-list__card-action">Ver comanda →</span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default withAppProviders(OrdersList);
