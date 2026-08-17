import { Eye, Loader2, Printer, Receipt } from 'lucide-react';
import { useState } from 'react';

import { brand } from '@/data/brand';
import { Alert, EmptyState, SkeletonTable } from '@/components/ui/Feedback';
import Modal from '@/components/ui/Modal';
import type { InvoiceListItem } from '@/lib/db/orders';
import type { OrderPayment } from '@/lib/db/types';
import {
  useInvoiceDetail,
  useInvoices,
  type InvoiceFilters,
} from '@/lib/hooks/queries/useInvoices';
import { formatOrderLabel } from '@/lib/orders/display';
import { formatExtraLine } from '@/lib/orders/item-extras';
import { getItemPreferenceLabel } from '@/lib/orders/item-preferences';
import { getPaymentLabel } from '@/lib/payments/methods';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { formatDateTime } from '@/lib/utils/datetime';
import { formatBs, formatUsd } from '@/lib/utils/currency';

import './InvoicesList.css';

function formatPrice(value: number): string {
  return new Intl.NumberFormat(brand.currency.locale, {
    style: 'currency',
    currency: brand.currency.code,
    minimumFractionDigits: brand.currency.code === 'COP' ? 0 : 2,
    maximumFractionDigits: brand.currency.code === 'COP' ? 0 : 2,
  }).format(value);
}

function formatPaymentLine(payment: OrderPayment): string {
  if (payment.foreign_currency === 'usd' && payment.foreign_amount != null) {
    return `${getPaymentLabel(payment.payment_method, payment.foreign_currency)} ${formatUsd(payment.foreign_amount)} (${formatPrice(payment.amount_cop)})`;
  }

  if (payment.foreign_currency === 'bs' && payment.foreign_amount != null) {
    return `${getPaymentLabel(payment.payment_method, payment.foreign_currency)} ${formatBs(payment.foreign_amount)} (${formatPrice(payment.amount_cop)})`;
  }

  return `${getPaymentLabel(payment.payment_method)} · ${formatPrice(payment.amount_cop)}`;
}

function getPaymentsSummary(payments: OrderPayment[]): string {
  if (payments.length === 0) return '—';
  if (payments.length === 1) return formatPaymentLine(payments[0]);
  return `Cobro dividido (${payments.length})`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultFilters = (): InvoiceFilters => ({
  dateFrom: todayISO(),
  dateTo: todayISO(),
  tableId: '',
  cashierId: '',
});

function InvoicesList() {
  const [draftFilters, setDraftFilters] = useState<InvoiceFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<InvoiceFilters>(defaultFilters);
  const { invoices, tables, cashiers, isLoading, isFetching, error } = useInvoices(appliedFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, isLoading: detailLoading } = useInvoiceDetail(selectedId);
  const [showTicket, setShowTicket] = useState(false);

  const loadError =
    error instanceof Error ? error.message : error ? 'No se pudieron cargar las facturas' : '';

  const totalFiltered = invoices.reduce((sum, inv) => sum + inv.total, 0);

  function openDetail(invoice: InvoiceListItem) {
    setSelectedId(invoice.id);
    setShowTicket(false);
  }

  function closeDetail() {
    setSelectedId(null);
    setShowTicket(false);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="invoices-list">
      <form
        className="invoices-list__filters"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedFilters({ ...draftFilters });
        }}
      >
        <label className="invoices-list__filter">
          Desde
          <input
            type="date"
            value={draftFilters.dateFrom}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            className="invoices-list__input"
          />
        </label>

        <label className="invoices-list__filter">
          Hasta
          <input
            type="date"
            value={draftFilters.dateTo}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            className="invoices-list__input"
          />
        </label>

        <label className="invoices-list__filter">
          Mesa
          <select
            value={draftFilters.tableId}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, tableId: e.target.value }))}
            className="invoices-list__input"
          >
            <option value="">Todas</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Mesa {t.number}
              </option>
            ))}
          </select>
        </label>

        <label className="invoices-list__filter">
          Cajero
          <select
            value={draftFilters.cashierId}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, cashierId: e.target.value }))}
            className="invoices-list__input"
          >
            <option value="">Todos</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.username}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="invoices-list__filter-btn" disabled={isFetching}>
          {isFetching ? <Loader2 className="invoices-list__spin" size={16} /> : 'Buscar'}
        </button>
      </form>

      <div className="invoices-list__summary">
        <span>
          <strong>{invoices.length}</strong> factura{invoices.length === 1 ? '' : 's'}
        </span>
        <span>
          Total: <strong>{formatPrice(totalFiltered)}</strong>
        </span>
      </div>

      {loadError && <Alert className="invoices-list__alert">{loadError}</Alert>}

      {isLoading ? (
        <SkeletonTable rows={8} className="invoices-list__skeleton" />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={<Receipt size={28} />}
          title="No hay facturas para los filtros seleccionados."
          className="invoices-list__empty"
        />
      ) : (
        <div className="invoices-list__table-wrap">
          <table className="invoices-list__table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Pedido</th>
                <th>Mesero</th>
                <th>Cajero</th>
                <th>Método</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{formatDateTime(invoice.updated_at)}</td>
                  <td>{formatOrderLabel(invoice)}</td>
                  <td>{invoice.username}</td>
                  <td>{invoice.cashier_username}</td>
                  <td>
                    {getPaymentLabel(invoice.payment_method, invoice.foreign_currency ?? null)}
                  </td>
                  <td className="invoices-list__total">{formatPrice(invoice.total)}</td>
                  <td>
                    <button
                      type="button"
                      className="invoices-list__view-btn"
                      onClick={() => openDetail(invoice)}
                      disabled={detailLoading && selectedId === invoice.id}
                    >
                      <Eye size={14} />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(selectedId)}
        onClose={closeDetail}
        title={
          detail ? (
            <>
              Factura — {formatOrderLabel({ ...detail.order, table_number: detail.table_number })}
            </>
          ) : (
            'Detalle de factura'
          )
        }
        panelClassName="invoices-list__modal"
        className="invoices-list__modal-overlay"
      >
        {detailLoading || !detail ? (
          <SkeletonTable rows={4} />
        ) : (
          <>
            <div className="invoices-list__detail-meta">
              <span>{formatDateTime(detail.order.updated_at)}</span>
              <span>Cajero: {detail.cashier_username}</span>
              <span>{getPaymentsSummary(detail.payments)}</span>
            </div>

            <ul className="invoices-list__detail-items">
              {detail.items.map((item) => {
                const preferences = getItemPreferenceLabel(item);

                return (
                  <li key={item.id}>
                    <span>
                      {item.quantity}× {item.product_name}
                      {preferences && (
                        <em className="invoices-list__item-note"> ({preferences})</em>
                      )}
                      {item.extras?.map((extra) => (
                        <em key={extra.product_id} className="invoices-list__item-note">
                          {' '}
                          {formatExtraLine(extra)}
                        </em>
                      ))}
                    </span>
                    <span>{formatPrice(item.quantity * item.price_at_sale)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="invoices-list__detail-total">
              <span>Total</span>
              <strong>{formatPrice(detail.order.total)}</strong>
            </div>

            {detail.payments.length > 0 && (
              <ul className="invoices-list__detail-payments">
                {detail.payments.map((payment) => (
                  <li key={payment.id}>{formatPaymentLine(payment)}</li>
                ))}
              </ul>
            )}

            <div className="invoices-list__modal-actions">
              <button
                type="button"
                className="invoices-list__action-btn invoices-list__action-btn--outline"
                onClick={() => setShowTicket((v) => !v)}
              >
                <Receipt size={16} />
                {showTicket ? 'Ocultar ticket' : 'Ver ticket'}
              </button>
              {showTicket && (
                <button
                  type="button"
                  className="invoices-list__action-btn invoices-list__action-btn--primary"
                  onClick={handlePrint}
                >
                  <Printer size={16} />
                  Imprimir
                </button>
              )}
            </div>

            {showTicket && (
              <div className="invoices-list__ticket" id="invoice-ticket">
                <div className="invoices-list__ticket-header">
                  <strong>{brand.name}</strong>
                  {brand.contact.address && <span>{brand.contact.address}</span>}
                  {brand.contact.phone && <span>{brand.contact.phone}</span>}
                  {brand.contact.instagram && <span>{brand.contact.instagram}</span>}
                </div>
                <div className="invoices-list__ticket-divider" />
                <p>{formatOrderLabel({ ...detail.order, table_number: detail.table_number })}</p>
                <p>{formatDateTime(detail.order.updated_at)}</p>
                <p>Cajero: {detail.cashier_username}</p>
                <div className="invoices-list__ticket-divider" />
                {detail.items.map((item) => (
                  <div key={item.id}>
                    <div className="invoices-list__ticket-line">
                      <span>
                        {item.quantity} {item.product_name}
                      </span>
                      <span>{formatPrice(item.quantity * item.price_at_sale)}</span>
                    </div>
                    {item.extras?.map((extra) => (
                      <p key={extra.product_id} className="invoices-list__item-note">
                        {formatExtraLine(extra)}
                      </p>
                    ))}
                  </div>
                ))}
                <div className="invoices-list__ticket-divider" />
                <div className="invoices-list__ticket-line invoices-list__ticket-total">
                  <span>TOTAL</span>
                  <span>{formatPrice(detail.order.total)}</span>
                </div>
                <p className="invoices-list__ticket-method">
                  {detail.payments.length > 0
                    ? detail.payments.map((payment) => formatPaymentLine(payment)).join(' · ')
                    : getPaymentLabel(detail.order.payment_method, detail.order.foreign_currency)}
                </p>
                <p className="invoices-list__ticket-footer">{brand.ticket.footer}</p>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export default withAppProviders(InvoicesList);
