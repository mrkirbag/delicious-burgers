import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Loader2, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { Alert, EmptyState, SkeletonGrid } from '@/components/ui/Feedback';
import { parseError } from '@/lib/api/parseError';
import { openDeliveryReadyWhatsApp } from '@/lib/delivery/whatsapp';
import { useKitchenOrders } from '@/lib/hooks/queries/useKitchenOrders';
import { formatOrderLabel } from '@/lib/orders/display';
import { formatExtraLine } from '@/lib/orders/item-extras';
import { getItemPreferenceLabel } from '@/lib/orders/item-preferences';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { elapsedMinutes, formatTime } from '@/lib/utils/datetime';

import './KitchenBoard.css';

function KitchenBoard() {
  const queryClient = useQueryClient();
  const { orders, isLoading, error } = useKitchenOrders();
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const markReadyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'listo' }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      return orderId;
    },
    onMutate: (orderId) => {
      setActingId(orderId);
      setActionError('');
    },
    onSuccess: (orderId) => {
      const order = orders.find((item) => item.id === orderId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenOrders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });

      if (order?.order_type === 'delivery' && !openDeliveryReadyWhatsApp(order)) {
        setActionError(
          'Pedido listo y entregado. No se pudo abrir WhatsApp: revisa el teléfono del cliente.',
        );
      }
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'No se pudo marcar como listo');
    },
    onSettled: () => setActingId(null),
  });

  const displayError =
    actionError || (error instanceof Error ? error.message : error ? 'No se pudieron cargar los pedidos' : '');

  return (
    <div className="kitchen-board">
      <div className="kitchen-board__toolbar">
        <div className="kitchen-board__summary">
          <span className="kitchen-board__summary-value">{orders.length}</span>
          <span className="kitchen-board__summary-label">Pedidos en preparación</span>
        </div>
      </div>

      {displayError && <Alert>{displayError}</Alert>}

      {isLoading ? (
        <SkeletonGrid count={4} />
      ) : orders.length === 0 ? (
        <EmptyState icon={<ChefHat size={32} />} title="No hay pedidos en cocina en este momento." />
      ) : (
        <div className="kitchen-board__grid">
          {orders.map((order) => {
            const waiting = elapsedMinutes(order.updated_at);
            const isActing = actingId === order.id;

            return (
              <article key={order.id} className="kitchen-board__card">
                <header className="kitchen-board__card-header">
                  <div>
                    <h2 className="kitchen-board__card-table">{formatOrderLabel(order)}</h2>
                    {order.order_type === 'delivery' && order.delivery_address && (
                      <p className="kitchen-board__card-address">{order.delivery_address}</p>
                    )}
                  </div>
                  <span className="kitchen-board__card-time">
                    {formatTime(order.updated_at)}
                    {waiting > 0 ? ` · ${waiting} min` : ''}
                  </span>
                </header>

                <ul className="kitchen-board__items">
                  {order.items.map((item) => {
                    const preferences = getItemPreferenceLabel(item);

                    return (
                      <li key={item.id} className="kitchen-board__item">
                        <div className="kitchen-board__item-row">
                          <span className="kitchen-board__item-qty">{item.quantity}</span>
                          <p className="kitchen-board__item-name">{item.product_name}</p>
                        </div>
                        {preferences && (
                          <p className="kitchen-board__item-notes">{preferences}</p>
                        )}
                        {item.extras?.map((extra) => (
                          <p key={extra.product_id} className="kitchen-board__item-notes">
                            {formatExtraLine(extra)}
                          </p>
                        ))}
                      </li>
                    );
                  })}
                </ul>

                <footer className="kitchen-board__card-footer">
                  <button
                    type="button"
                    className="kitchen-board__ready-btn"
                    onClick={() => markReadyMutation.mutate(order.id)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <Loader2 className="kitchen-board__spin" size={16} />
                    ) : order.order_type === 'delivery' ? (
                      <MessageCircle size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {order.order_type === 'delivery' ? 'Listo, entregar y avisar' : 'Listo y entregar'}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default withAppProviders(KitchenBoard);
