import { brand } from '@/data/brand';
import type { OrderItemWithProduct } from '@/lib/db/orders';
import type { Order, OrderPayment } from '@/lib/db/types';
import { formatOrderLabel } from '@/lib/orders/display';
import { formatOrderPaymentLine } from '@/lib/payments/display';
import { formatCop } from '@/lib/utils/currency';

import './SaleTicket.css';

export type SaleTicketProps = {
  order: Order;
  items: OrderItemWithProduct[];
  tableNumber?: string | null;
  cashierUsername?: string;
  payments?: OrderPayment[];
  paymentPreview?: string;
  ticketId?: string;
};

function formatTicketDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(brand.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function SaleTicket({
  order,
  items,
  tableNumber,
  cashierUsername,
  payments = [],
  paymentPreview,
  ticketId = 'sale-ticket',
}: SaleTicketProps) {
  const paymentText =
    payments.length > 0
      ? payments.map((payment) => formatOrderPaymentLine(payment)).join(' · ')
      : paymentPreview ?? '—';

  return (
    <article className="sale-ticket" id={ticketId} aria-label="Ticket de venta">
      <header className="sale-ticket__header">
        <p className="sale-ticket__brand">{brand.name}</p>
        {brand.contact.address && <p>{brand.contact.address}</p>}
        {brand.ticket.taxId && <p>RIF: {brand.ticket.taxId}</p>}
      </header>

      <div className="sale-ticket__divider" />

      <section className="sale-ticket__meta">
        <p className="sale-ticket__order-label">
          {formatOrderLabel({ ...order, table_number: tableNumber ?? null })}
        </p>
        <p>#{order.id.slice(0, 8).toUpperCase()}</p>
        <p>{formatTicketDateTime(order.updated_at)}</p>
        {cashierUsername && <p>Cajero: {cashierUsername}</p>}
      </section>

      <div className="sale-ticket__divider" />

      <section className="sale-ticket__items">
        {items.map((item) => (
          <div key={item.id} className="sale-ticket__line">
            <span>
              {item.quantity} {item.product_name}
            </span>
            <span>{formatCop(item.quantity * item.price_at_sale)}</span>
          </div>
        ))}
      </section>

      <div className="sale-ticket__divider" />

      <div className="sale-ticket__line sale-ticket__total">
        <span>TOTAL</span>
        <span>{formatCop(order.total)}</span>
      </div>

      <p className="sale-ticket__payment">{paymentText}</p>

      <p className="sale-ticket__footer">{brand.ticket.footer}</p>
    </article>
  );
}
