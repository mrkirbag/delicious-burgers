import { ArrowLeftRight, Download, Eye, Loader2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Alert, EmptyState, SkeletonTable } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import type { CashRegisterSummary, PaymentMethodBreakdown } from '@/lib/db/cash-registers';
import type { PaidOrderWithPayments } from '@/lib/db/orders';
import {
  useCashFlow,
  useCashFlowDetail,
  type CashFlowFilters,
} from '@/lib/hooks/queries/useCashFlow';
import { downloadDayOrdersPdf } from '@/lib/cash-flow/export-day-orders-pdf';
import {
  buildOrderPaymentRows,
  formatPaymentAmount,
  formatPaymentMethodLabel,
  groupOrderPaymentRows,
} from '@/lib/cash-flow/order-rows';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { formatDateTime, formatTime } from '@/lib/utils/datetime';
import { formatBs, formatCop, formatUsd } from '@/lib/utils/currency';
import { getPaymentLabel } from '@/lib/payments/methods';

import './CashFlowPanel.css';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultFilters = (): CashFlowFilters => ({
  date: todayISO(),
  openedBy: '',
  status: 'all',
});

function getDifferenceCop(session: CashRegisterSummary): number | null {
  if (session.status !== 'closed') return null;
  return (session.actual_balance ?? 0) - (session.final_balance ?? 0);
}

function getDifferenceUsd(session: CashRegisterSummary): number | null {
  if (session.status !== 'closed') return null;
  return (session.actual_balance_usd ?? 0) - (session.final_balance_usd ?? 0);
}

function formatDifference(value: number | null, formatter: (n: number) => string): string {
  if (value == null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatter(value)}`;
}
function StatusBadge({ status }: { status: CashRegisterSummary['status'] }) {
  return (
    <span className={`cash-flow__badge cash-flow__badge--${status}`}>
      {status === 'open' ? 'Abierta' : 'Cerrada'}
    </span>
  );
}

function PaymentBreakdownTable({
  breakdown,
  emptyLabel,
}: {
  breakdown: PaymentMethodBreakdown[];
  emptyLabel: string;
}) {
  const totalCop = breakdown.reduce((sum, line) => sum + line.total_cop, 0);

  if (breakdown.length === 0) {
    return <p className="cash-flow__detail-empty">{emptyLabel}</p>;
  }

  return (
    <div className="cash-flow__mini-table-wrap">
      <table className="cash-flow__mini-table">
        <thead>
          <tr>
            <th>Método</th>
            <th>Monto cobrado</th>
            <th>Equiv. COP</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((line) => (
            <tr key={`${line.payment_method}-${line.foreign_currency ?? 'cop'}`}>
              <td>{getPaymentLabel(line.payment_method, line.foreign_currency)}</td>
              <td>
                {line.total_foreign != null && line.foreign_currency === 'usd'
                  ? formatUsd(line.total_foreign)
                  : line.total_foreign != null && line.foreign_currency === 'bs'
                    ? formatBs(line.total_foreign)
                    : formatCop(line.total_cop)}
              </td>
              <td>{formatCop(line.total_cop)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td>{formatCop(totalCop)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function OrdersDetailTable({
  orders,
  totalLabel = 'Total',
}: {
  orders: PaidOrderWithPayments[];
  totalLabel?: string;
}) {
  const orderGroups = useMemo(
    () => groupOrderPaymentRows(buildOrderPaymentRows(orders)),
    [orders],
  );

  const totalCop = orders.reduce((sum, order) => sum + order.total, 0);

  if (orders.length === 0) {
    return <p className="cash-flow__detail-empty">No hay pedidos cobrados.</p>;
  }

  return (
    <div className="cash-flow__orders-table-wrap">
      <table className="cash-flow__orders-table">
        <thead>
          <tr>
            <th>Comanda</th>
            <th>Hora</th>
            <th>Total pedido</th>
            <th>Método de pago</th>
            <th>Monto cobrado</th>
            <th>Equiv. COP</th>
          </tr>
        </thead>
        {orderGroups.map((group, groupIndex) => (
          <tbody
            key={group[0]?.orderId ?? groupIndex}
            className={`cash-flow__orders-group${groupIndex % 2 === 1 ? ' cash-flow__orders-group--alt' : ''}`}
          >
            {group.map((row) => (
              <tr
                key={row.key}
                className={
                  row.showOrderMeta
                    ? 'cash-flow__orders-table-row--start'
                    : 'cash-flow__orders-table-row--payment'
                }
              >
                <td>{row.showOrderMeta ? <strong>{row.orderLabel}</strong> : ''}</td>
                <td>{row.showOrderMeta ? row.time : ''}</td>
                <td>{row.showOrderMeta ? formatCop(row.orderTotal) : ''}</td>
                <td>{formatPaymentMethodLabel(row.payment)}</td>
                <td>{formatPaymentAmount(row.payment)}</td>
                <td>{formatCop(row.payment.amount_cop)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <td colSpan={5}>{totalLabel}</td>
            <td>{formatCop(totalCop)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CashSessionBalance({
  title,
  cop,
  usd,
  variant,
}: {
  title: string;
  cop: number;
  usd: number;
  variant: 'open' | 'close' | 'theoretical' | 'actual';
}) {
  return (
    <div className={`cash-flow__balance-card cash-flow__balance-card--${variant}`}>
      <h4>{title}</h4>
      <dl>
        <div>
          <dt>Efectivo COP</dt>
          <dd>{formatCop(cop)}</dd>
        </div>
        <div>
          <dt>Efectivo USD</dt>
          <dd>{formatUsd(usd)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { detail, isLoading, error } = useCashFlowDetail(sessionId);

  const loadError =
    error instanceof Error ? error.message : error ? 'No se pudo cargar el detalle' : '';

  if (isLoading) {
    return (
      <div className="cash-flow__detail-loading">
        <Loader2 className="cash-flow__spin" size={24} />
        <span>Cargando turno…</span>
      </div>
    );
  }

  if (loadError) {
    return <Alert>{loadError}</Alert>;
  }

  if (!detail) return null;

  const { session, paymentBreakdown, orders } = detail;
  const differenceCop = getDifferenceCop(session);
  const differenceUsd = getDifferenceUsd(session);
  const theoreticalCop =
    session.status === 'closed' ? (session.final_balance ?? 0) : session.theoretical_cash_balance;
  const theoreticalUsd =
    session.status === 'closed'
      ? (session.final_balance_usd ?? 0)
      : session.theoretical_cash_balance_usd;

  return (
    <div className="cash-flow__detail">
      <header className="cash-flow__detail-header">
        <div>
          <p className="cash-flow__detail-eyebrow">Turno de caja</p>
          <h3 className="cash-flow__detail-title">{session.opened_by_username}</h3>
          <p className="cash-flow__detail-meta">
            Abierta {formatDateTime(session.opened_at)}
            {session.closed_at ? ` · Cerrada ${formatDateTime(session.closed_at)}` : ''}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </header>

      <div className="cash-flow__balance-grid">
        <CashSessionBalance
          title="Apertura de caja"
          cop={session.initial_balance}
          usd={session.initial_balance_usd}
          variant="open"
        />
        <CashSessionBalance
          title="Teórico al cierre"
          cop={theoreticalCop}
          usd={theoreticalUsd}
          variant="theoretical"
        />
        {session.status === 'closed' ? (
          <>
            <CashSessionBalance
              title="Contado al cierre"
              cop={session.actual_balance ?? 0}
              usd={session.actual_balance_usd ?? 0}
              variant="actual"
            />
            <div className="cash-flow__balance-card cash-flow__balance-card--diff">
              <h4>Diferencia</h4>
              <dl>
                <div className={differenceCop !== 0 ? 'cash-flow__diff' : ''}>
                  <dt>COP</dt>
                  <dd>{formatDifference(differenceCop, formatCop)}</dd>
                </div>
                <div className={differenceUsd !== 0 ? 'cash-flow__diff' : ''}>
                  <dt>USD</dt>
                  <dd>{formatDifference(differenceUsd, formatUsd)}</dd>
                </div>
              </dl>
            </div>
          </>
        ) : (
          <div className="cash-flow__balance-card cash-flow__balance-card--close">
            <h4>Cierre de caja</h4>
            <p className="cash-flow__detail-empty">Turno en curso. La caja aún no se ha cerrado.</p>
          </div>
        )}
      </div>

      <div className="cash-flow__detail-stats">
        <div className="cash-flow__detail-stat">
          <span>Total ventas</span>
          <strong>{formatCop(session.total_sales)}</strong>
        </div>
        <div className="cash-flow__detail-stat">
          <span>Pedidos cobrados</span>
          <strong>{session.paid_order_count}</strong>
        </div>
        <div className="cash-flow__detail-stat">
          <span>Ventas efectivo COP</span>
          <strong>{formatCop(session.cash_sales)}</strong>
        </div>
        <div className="cash-flow__detail-stat">
          <span>Cobros USD en efectivo</span>
          <strong>{formatUsd(session.usd_cash_collected)}</strong>
        </div>
      </div>

      <section className="cash-flow__detail-section">
        <h4>Totales por método de pago</h4>
        <PaymentBreakdownTable
          breakdown={paymentBreakdown}
          emptyLabel="Sin cobros registrados en este turno."
        />
      </section>

      <section className="cash-flow__detail-section">
        <h4>Pedidos del turno ({orders.length})</h4>
        <OrdersDetailTable orders={orders} totalLabel="Total del turno" />
      </section>

      <footer className="cash-flow__detail-footer">
        <button type="button" className="cash-flow__btn cash-flow__btn--outline" onClick={onClose}>
          Cerrar
        </button>
      </footer>
    </div>
  );
}

function CashFlowPanel() {
  const [draftFilters, setDraftFilters] = useState<CashFlowFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<CashFlowFilters>(defaultFilters);
  const { sessions, orders, paymentBreakdown, cashiers, isLoading, isFetching, error } =
    useCashFlow(appliedFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadError =
    error instanceof Error ? error.message : error ? 'No se pudo cargar el flujo de caja' : '';

  const summary = useMemo(() => {
    const closedSessions = sessions.filter((session) => session.status === 'closed');
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = orders.length;
    const totalDiffCop = closedSessions.reduce(
      (sum, session) => sum + (getDifferenceCop(session) ?? 0),
      0,
    );
    const totalDiffUsd = closedSessions.reduce(
      (sum, session) => sum + (getDifferenceUsd(session) ?? 0),
      0,
    );
    const openingCop = sessions.reduce((sum, session) => sum + session.initial_balance, 0);
    const openingUsd = sessions.reduce((sum, session) => sum + session.initial_balance_usd, 0);
    const closingCop = closedSessions.reduce(
      (sum, session) => sum + (session.actual_balance ?? 0),
      0,
    );
    const closingUsd = closedSessions.reduce(
      (sum, session) => sum + (session.actual_balance_usd ?? 0),
      0,
    );

    return {
      sessionCount: sessions.length,
      closedCount: closedSessions.length,
      openCount: sessions.length - closedSessions.length,
      totalSales,
      totalOrders,
      totalDiffCop,
      totalDiffUsd,
      openingCop,
      openingUsd,
      closingCop,
      closingUsd,
    };
  }, [sessions, orders]);

  return (
    <div className="cash-flow">
      <form
        className="cash-flow__filters"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedFilters({ ...draftFilters });
        }}
      >
        <label className="cash-flow__filter">
          Fecha
          <input
            type="date"
            value={draftFilters.date}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, date: e.target.value }))}
            className="cash-flow__input"
          />
        </label>

        <label className="cash-flow__filter">
          Cajero
          <select
            value={draftFilters.openedBy}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, openedBy: e.target.value }))}
            className="cash-flow__input"
          >
            <option value="">Todos</option>
            {cashiers.map((cashier) => (
              <option key={cashier.id} value={cashier.id}>
                {cashier.username}
              </option>
            ))}
          </select>
        </label>

        <label className="cash-flow__filter">
          Estado
          <select
            value={draftFilters.status}
            onChange={(e) =>
              setDraftFilters((prev) => ({
                ...prev,
                status: e.target.value as CashFlowFilters['status'],
              }))
            }
            className="cash-flow__input"
          >
            <option value="all">Todos</option>
            <option value="open">Abiertas</option>
            <option value="closed">Cerradas</option>
          </select>
        </label>

        <button type="submit" className="cash-flow__filter-btn" disabled={isFetching}>
          {isFetching ? <Loader2 className="cash-flow__spin" size={16} /> : 'Buscar'}
        </button>

        <button
          type="button"
          className="cash-flow__download-btn"
          disabled={isLoading || isFetching || orders.length === 0}
          title={orders.length === 0 ? 'No hay pedidos para exportar' : 'Descargar pedidos del día en PDF'}
          onClick={() =>
            downloadDayOrdersPdf({
              date: appliedFilters.date,
              orders,
              paymentBreakdown,
              summary: {
                openingCop: summary.openingCop,
                openingUsd: summary.openingUsd,
                closingCop: summary.closingCop,
                closingUsd: summary.closingUsd,
                totalSales: summary.totalSales,
                totalOrders: summary.totalOrders,
              },
            })
          }
        >
          <Download size={16} />
          Descargar PDF
        </button>
      </form>

      {loadError && <Alert>{loadError}</Alert>}

      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : (
        <>
          {!isLoading && sessions.length > 0 && (
            <div className="cash-flow__day-summary">
              <div className="cash-flow__day-card">
                <span>Aperturas del día</span>
                <strong>{formatCop(summary.openingCop)}</strong>
                <small>{formatUsd(summary.openingUsd)} en efectivo USD</small>
              </div>
              <div className="cash-flow__day-card">
                <span>Cierres contados</span>
                <strong>{formatCop(summary.closingCop)}</strong>
                <small>{formatUsd(summary.closingUsd)} en efectivo USD</small>
              </div>
              <div className="cash-flow__day-card">
                <span>Total ventas</span>
                <strong>{formatCop(summary.totalSales)}</strong>
                <small>{summary.totalOrders} pedido{summary.totalOrders === 1 ? '' : 's'}</small>
              </div>
              {summary.closedCount > 0 && (
                <div className="cash-flow__day-card">
                  <span>Diferencias</span>
                  <strong className={summary.totalDiffCop !== 0 ? 'cash-flow__diff-text' : ''}>
                    {formatDifference(summary.totalDiffCop, formatCop)}
                  </strong>
                  <small className={summary.totalDiffUsd !== 0 ? 'cash-flow__diff-text' : ''}>
                    {formatDifference(summary.totalDiffUsd, formatUsd)} USD
                  </small>
                </div>
              )}
            </div>
          )}

          {sessions.length === 0 ? (
            <EmptyState
              icon={<Wallet size={28} />}
              title="No hay turnos de caja en el día seleccionado."
            />
          ) : (
            <section className="cash-flow__block">
              <h2 className="cash-flow__block-title">Turnos de caja</h2>
              <div className="cash-flow__table-wrap">
                <table className="cash-flow__table">
                  <thead>
                    <tr>
                      <th>Apertura</th>
                      <th>Cajero</th>
                      <th>Estado</th>
                      <th>Apertura COP</th>
                      <th>Cierre COP</th>
                      <th>Ventas</th>
                      <th>Pedidos</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <span className="cash-flow__date">{formatDateTime(session.opened_at)}</span>
                          {session.closed_at && (
                            <span className="cash-flow__date-sub">
                              Cierre {formatTime(session.closed_at)}
                            </span>
                          )}
                        </td>
                        <td>{session.opened_by_username}</td>
                        <td>
                          <StatusBadge status={session.status} />
                        </td>
                        <td>{formatCop(session.initial_balance)}</td>
                        <td>
                          {session.status === 'closed'
                            ? formatCop(session.actual_balance ?? 0)
                            : '—'}
                        </td>
                        <td>{formatCop(session.total_sales)}</td>
                        <td>{session.paid_order_count}</td>
                        <td>
                          <button
                            type="button"
                            className="cash-flow__view-btn"
                            onClick={() => setSelectedId(session.id)}
                            aria-label="Ver detalle del turno"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="cash-flow__block">
            <h2 className="cash-flow__block-title">Pedidos del día ({orders.length})</h2>
            <OrdersDetailTable orders={orders} totalLabel="Total del día" />
          </section>

          <section className="cash-flow__block">
            <h2 className="cash-flow__block-title">Totales por método de pago</h2>
            <PaymentBreakdownTable
              breakdown={paymentBreakdown}
              emptyLabel="No hay cobros registrados en el día seleccionado."
            />
          </section>
        </>
      )}

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={
          <span className="cash-flow__modal-title">
            <ArrowLeftRight size={18} />
            Detalle del turno
          </span>
        }
        panelClassName="cash-flow__modal-panel"
      >
        {selectedId && <SessionDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />}
      </Modal>
    </div>
  );
}

export default withAppProviders(CashFlowPanel);
