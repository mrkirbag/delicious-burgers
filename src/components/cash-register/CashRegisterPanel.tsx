import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Loader2,
  Lock,
  Receipt,
  DollarSign,
  Unlock,
  Wallet,
} from 'lucide-react';

import PayOrderModal from '@/components/cash-register/PayOrderModal';
import { useToast } from '@/components/providers/ToastProvider';
import SaleTicketModal from '@/components/tickets/SaleTicketModal';
import { Alert, Spinner } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import { parseError } from '@/lib/api/parseError';
import type { CashRegisterSummary } from '@/lib/db/cash-registers';
import type { OrderItemWithProduct, OrderListItem } from '@/lib/db/orders';
import type { Order, OrderPayment, OrderPaymentInput } from '@/lib/db/types';
import { useCashRegister } from '@/lib/hooks/queries/useCashRegister';
import { formatOrderLabel } from '@/lib/orders/display';
import { getPaySuccessMessage } from '@/lib/orders/delivery-flow';
import { queryKeys } from '@/lib/query/keys';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { formatDateTime } from '@/lib/utils/datetime';
import { formatCop, formatUsd } from '@/lib/utils/currency';

import './CashRegisterPanel.css';

function formatPrice(value: number): string {
  return formatCop(value);
}

type PayModalState = {
  order: OrderListItem;
};

type PaidTicketState = {
  order: Order;
  items: OrderItemWithProduct[];
  payments: OrderPayment[];
  tableNumber: string | null;
  cashierUsername: string;
};

type CloseModalState = {
  actualBalanceCop: string;
  actualBalanceUsd: string;
};

function CashRegisterPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register: queryRegister,
    pendingOrders,
    exchangeRates,
    isLoading,
    error: loadError,
  } = useCashRegister();

  const [registerOverride, setRegisterOverride] = useState<CashRegisterSummary | null | undefined>(
    undefined,
  );
  const register = registerOverride !== undefined ? registerOverride : queryRegister;

  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const [initialBalanceCop, setInitialBalanceCop] = useState('0');
  const [initialBalanceUsd, setInitialBalanceUsd] = useState('0');
  const [payModal, setPayModal] = useState<PayModalState | null>(null);
  const [paidTicket, setPaidTicket] = useState<PaidTicketState | null>(null);
  const [closeModal, setCloseModal] = useState<CloseModalState | null>(null);
  const [closeResult, setCloseResult] = useState<CashRegisterSummary | null>(null);

  function refreshCashData() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cashRegister });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cashFlow });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  }

  async function handleOpenRegister(event: React.FormEvent) {
    event.preventDefault();
    setActing(true);
    setError('');

    const balanceCop = Number(initialBalanceCop);
    const balanceUsd = Number(initialBalanceUsd);

    if (!Number.isFinite(balanceCop) || balanceCop < 0) {
      setError('Saldo inicial en pesos inválido');
      setActing(false);
      return;
    }

    if (!Number.isFinite(balanceUsd) || balanceUsd < 0) {
      setError('Saldo inicial en dólares inválido');
      setActing(false);
      return;
    }

    try {
      const response = await fetch('/api/cash-registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initial_balance: balanceCop,
          initial_balance_usd: balanceUsd,
        }),
      });

      if (!response.ok) {
        setError(await parseError(response));
        return;
      }

      const data = await response.json();
      setRegisterOverride(data.register);
      toast.success('Caja abierta correctamente');
      refreshCashData();
    } catch {
      setError('No se pudo abrir la caja');
    } finally {
      setActing(false);
    }
  }

  async function handlePay(payments: OrderPaymentInput[]) {
    if (!payModal || !register) return;

    setActing(true);
    setError('');

    try {
      const response = await fetch(`/api/orders/${payModal.order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments,
          cash_register_id: register.id,
        }),
      });

      if (!response.ok) {
        setError(await parseError(response));
        return;
      }

      const data = await response.json();

      setPayModal(null);
      setPaidTicket({
        order: data.order,
        items: data.items ?? [],
        payments: data.payments ?? [],
        tableNumber: payModal.order.table_number,
        cashierUsername: register.opened_by_username,
      });
      toast.success(
        `${formatOrderLabel(payModal.order)} cobrado. ${getPaySuccessMessage(payModal.order)}`,
      );
      refreshCashData();
    } catch {
      setError('No se pudo cobrar la comanda');
    } finally {
      setActing(false);
    }
  }

  async function handleCloseRegister() {
    if (!closeModal || !register) return;

    const actualBalanceCop = Number(closeModal.actualBalanceCop);
    const actualBalanceUsd = Number(closeModal.actualBalanceUsd);

    if (!Number.isFinite(actualBalanceCop) || actualBalanceCop < 0) {
      setError('Saldo contado en pesos inválido');
      return;
    }

    if (!Number.isFinite(actualBalanceUsd) || actualBalanceUsd < 0) {
      setError('Saldo contado en dólares inválido');
      return;
    }

    setActing(true);
    setError('');

    try {
      const response = await fetch(`/api/cash-registers/${register.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_balance: actualBalanceCop,
          actual_balance_usd: actualBalanceUsd,
        }),
      });

      if (!response.ok) {
        setError(await parseError(response));
        return;
      }

      const data = await response.json();
      setCloseModal(null);
      setCloseResult(data.register);
      setRegisterOverride(null);
      refreshCashData();
    } catch {
      setError('No se pudo cerrar la caja');
    } finally {
      setActing(false);
    }
  }

  const displayError =
    error ||
    (loadError instanceof Error ? loadError.message : loadError ? 'No se pudo cargar la caja' : '');

  if (isLoading) {
    return <Spinner label="Cargando caja…" className="cash-panel__loading" />;
  }

  if (closeResult) {
    const differenceCop =
      (closeResult.actual_balance ?? 0) - (closeResult.final_balance ?? 0);
    const differenceUsd =
      (closeResult.actual_balance_usd ?? 0) - (closeResult.final_balance_usd ?? 0);

    return (
      <div className="cash-panel">
        <div className="cash-panel__close-summary">
          <h2 className="cash-panel__close-title">Caja cerrada</h2>
          <p className="cash-panel__close-subtitle">
            Turno de {closeResult.opened_by_username} · {formatDateTime(closeResult.opened_at)}
          </p>

          <h3 className="cash-panel__close-section">Efectivo en pesos (COP)</h3>
          <dl className="cash-panel__close-grid">
            <div>
              <dt>Saldo inicial</dt>
              <dd>{formatPrice(closeResult.initial_balance)}</dd>
            </div>
            <div>
              <dt>Ventas en efectivo</dt>
              <dd>{formatPrice(closeResult.cash_sales)}</dd>
            </div>
            <div>
              <dt>Saldo teórico</dt>
              <dd>{formatPrice(closeResult.final_balance ?? 0)}</dd>
            </div>
            <div>
              <dt>Saldo contado</dt>
              <dd>{formatPrice(closeResult.actual_balance ?? 0)}</dd>
            </div>
            <div className={differenceCop !== 0 ? 'cash-panel__close-diff' : ''}>
              <dt>Diferencia</dt>
              <dd>
                {differenceCop > 0 ? '+' : ''}
                {formatPrice(differenceCop)}
              </dd>
            </div>
          </dl>

          <h3 className="cash-panel__close-section">Efectivo en dólares (USD)</h3>
          <dl className="cash-panel__close-grid">
            <div>
              <dt>Saldo inicial</dt>
              <dd>{formatUsd(closeResult.initial_balance_usd)}</dd>
            </div>
            <div>
              <dt>Cobros en USD</dt>
              <dd>{formatUsd(closeResult.usd_cash_collected)}</dd>
            </div>
            <div>
              <dt>Saldo teórico</dt>
              <dd>{formatUsd(closeResult.final_balance_usd ?? 0)}</dd>
            </div>
            <div>
              <dt>Saldo contado</dt>
              <dd>{formatUsd(closeResult.actual_balance_usd ?? 0)}</dd>
            </div>
            <div className={differenceUsd !== 0 ? 'cash-panel__close-diff' : ''}>
              <dt>Diferencia</dt>
              <dd>
                {differenceUsd > 0 ? '+' : ''}
                {formatUsd(differenceUsd)}
              </dd>
            </div>
          </dl>

          <dl className="cash-panel__close-grid cash-panel__close-grid--summary">
            <div>
              <dt>Total ventas</dt>
              <dd>{formatPrice(closeResult.total_sales)}</dd>
            </div>
            <div>
              <dt>Comandas cobradas</dt>
              <dd>{closeResult.paid_order_count}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="cash-panel__btn cash-panel__btn--primary"
            onClick={() => {
              setCloseResult(null);
              setRegisterOverride(undefined);
              refreshCashData();
            }}
          >
            Abrir nueva caja
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cash-panel">
      {displayError && <Alert>{displayError}</Alert>}

      {!register ? (
        <section className="cash-panel__open">
          <div className="cash-panel__open-icon">
            <Unlock size={28} />
          </div>
          <h2 className="cash-panel__section-title">Abrir caja</h2>

          <form className="cash-panel__open-form" onSubmit={(e) => void handleOpenRegister(e)}>
            <label className="cash-panel__label">
              Efectivo inicial (COP)
              <div className="cash-panel__input-wrap">
                <Wallet size={16} />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialBalanceCop}
                  onChange={(e) => setInitialBalanceCop(e.target.value)}
                  className="cash-panel__input"
                  required
                />
              </div>
            </label>

            <label className="cash-panel__label">
              Efectivo inicial (USD)
              <div className="cash-panel__input-wrap">
                <DollarSign size={16} />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialBalanceUsd}
                  onChange={(e) => setInitialBalanceUsd(e.target.value)}
                  className="cash-panel__input"
                  required
                />
              </div>
            </label>

            <button
              type="submit"
              className="cash-panel__btn cash-panel__btn--primary"
              disabled={acting}
            >
              {acting ? <Loader2 className="cash-panel__spin" size={16} /> : <Unlock size={16} />}
              Abrir caja
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="cash-panel__session">
            <div className="cash-panel__session-header">
              <div>
                <p className="cash-panel__session-eyebrow">Caja activa</p>
                <h2 className="cash-panel__section-title">
                  Turno de {register.opened_by_username}
                </h2>
                <p className="cash-panel__section-desc">
                  Abierta {formatDateTime(register.opened_at)}
                </p>
              </div>
              <button
                type="button"
                className="cash-panel__btn cash-panel__btn--outline"
                onClick={() =>
                  setCloseModal({
                    actualBalanceCop: String(register.theoretical_cash_balance),
                    actualBalanceUsd: String(register.theoretical_cash_balance_usd),
                  })
                }
              >
                <Lock size={16} />
                Cerrar caja
              </button>
            </div>

            <div className="cash-panel__stats">
              <div className="cash-panel__stat">
                <span className="cash-panel__stat-label">Efectivo COP</span>
                <span className="cash-panel__stat-value">
                  {formatPrice(register.theoretical_cash_balance)}
                </span>
              </div>
              <div className="cash-panel__stat">
                <span className="cash-panel__stat-label">Efectivo USD</span>
                <span className="cash-panel__stat-value">
                  {formatUsd(register.theoretical_cash_balance_usd)}
                </span>
              </div>
              <div className="cash-panel__stat">
                <span className="cash-panel__stat-label">Total ventas</span>
                <span className="cash-panel__stat-value">{formatPrice(register.total_sales)}</span>
              </div>
              <div className="cash-panel__stat">
                <span className="cash-panel__stat-label">Cobradas</span>
                <span className="cash-panel__stat-value">{register.paid_order_count}</span>
              </div>
            </div>

            <div className="cash-panel__breakdown">
              <span>Efectivo COP: {formatPrice(register.cash_sales)}</span>
              <span>Cobros USD: {formatUsd(register.usd_cash_collected)}</span>
              <span>P. venta: {formatPrice(register.card_sales)}</span>
              <span>P. móvil: {formatPrice(register.mobile_sales)}</span>
            </div>
          </section>

          <section className="cash-panel__pending">
            <div className="cash-panel__pending-header">
              <h2 className="cash-panel__section-title">Pendientes de cobro</h2>
              <span className="cash-panel__pending-count">{pendingOrders.length}</span>
            </div>

            {pendingOrders.length === 0 ? (
              <div className="cash-panel__empty">
                <Receipt size={24} />
                <p>No hay comandas pendientes de cobro.</p>
              </div>
            ) : (
              <div className="cash-panel__orders">
                {pendingOrders.map((order) => (
                  <article key={order.id} className="cash-panel__order-card">
                    <div className="cash-panel__order-info">
                      <h3>{formatOrderLabel(order)}</h3>
                      <p>
                        {order.item_count} producto{order.item_count === 1 ? '' : 's'} ·{' '}
                        {order.username}
                      </p>
                      <p className="cash-panel__order-time">
                        {order.order_type === 'delivery' && order.status === 'pendiente'
                          ? 'Pago anticipado'
                          : order.order_type === 'delivery' && order.status === 'listo'
                            ? 'Listo para facturar'
                            : 'Entregado'}{' '}
                        {formatDateTime(order.updated_at)}
                      </p>
                    </div>
                    <div className="cash-panel__order-actions">
                      <span className="cash-panel__order-total">{formatPrice(order.total)}</span>
                      <button
                        type="button"
                        className="cash-panel__btn cash-panel__btn--primary cash-panel__btn--sm"
                        onClick={() => setPayModal({ order })}
                      >
                        Cobrar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {payModal && (
        <PayOrderModal
          order={payModal.order}
          exchangeRates={exchangeRates}
          cashierUsername={register?.opened_by_username}
          acting={acting}
          onClose={() => setPayModal(null)}
          onConfirm={(payments) => void handlePay(payments)}
        />
      )}

      {paidTicket && (
        <SaleTicketModal
          order={paidTicket.order}
          items={paidTicket.items}
          tableNumber={paidTicket.tableNumber}
          cashierUsername={paidTicket.cashierUsername}
          payments={paidTicket.payments}
          title="Ticket cobrado"
          onClose={() => setPaidTicket(null)}
        />
      )}

      <Modal
        open={Boolean(closeModal && register)}
        onClose={() => setCloseModal(null)}
        title="Cerrar caja"
        panelClassName="cash-panel__modal"
        className="cash-panel__modal-overlay"
      >
        {closeModal && register && (
          <>
            <dl className="cash-panel__close-preview">
              <div>
                <dt>Teórico en efectivo (COP)</dt>
                <dd>{formatPrice(register.theoretical_cash_balance)}</dd>
              </div>
              <div>
                <dt>Teórico en efectivo (USD)</dt>
                <dd>{formatUsd(register.theoretical_cash_balance_usd)}</dd>
              </div>
              <div>
                <dt>Total ventas del turno</dt>
                <dd>{formatPrice(register.total_sales)}</dd>
              </div>
            </dl>

            <label className="cash-panel__label">
              Efectivo contado (COP)
              <div className="cash-panel__input-wrap">
                <Wallet size={16} />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={closeModal.actualBalanceCop}
                  onChange={(e) =>
                    setCloseModal((prev) =>
                      prev ? { ...prev, actualBalanceCop: e.target.value } : prev,
                    )
                  }
                  className="cash-panel__input"
                  required
                />
              </div>
            </label>

            <label className="cash-panel__label">
              Efectivo contado (USD)
              <div className="cash-panel__input-wrap">
                <DollarSign size={16} />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={closeModal.actualBalanceUsd}
                  onChange={(e) =>
                    setCloseModal((prev) =>
                      prev ? { ...prev, actualBalanceUsd: e.target.value } : prev,
                    )
                  }
                  className="cash-panel__input"
                  required
                />
              </div>
            </label>

            <div className="cash-panel__modal-actions">
              <button
                type="button"
                className="cash-panel__btn cash-panel__btn--outline"
                onClick={() => setCloseModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cash-panel__btn cash-panel__btn--primary"
                onClick={() => void handleCloseRegister()}
                disabled={acting}
              >
                {acting ? (
                  <Loader2 className="cash-panel__spin" size={16} />
                ) : (
                  <Lock size={16} />
                )}
                Cerrar caja
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default withAppProviders(CashRegisterPanel);
