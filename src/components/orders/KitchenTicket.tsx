import { brand } from '@/data/brand';
import type { OrderItemWithProduct } from '@/lib/db/orders';
import type { Order } from '@/lib/db/types';
import { formatOrderLabel } from '@/lib/orders/display';
import { getItemPreferenceLabel } from '@/lib/orders/item-preferences';

import './KitchenTicket.css';

export type KitchenTicketProps = {
  order: Order;
  items: OrderItemWithProduct[];
  tableNumber?: string | null;
  sentAt?: string;
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

export default function KitchenTicket({
  order,
  items,
  tableNumber,
  sentAt,
  ticketId = 'kitchen-ticket',
}: KitchenTicketProps) {
  const orderLabel = formatOrderLabel({ ...order, table_number: tableNumber ?? null });
  const printedAt = sentAt ?? order.updated_at;

  return (
    <article className="kitchen-ticket" id={ticketId} aria-label="Ticket de cocina">
      <header className="kitchen-ticket__header">
        <p className="kitchen-ticket__brand">{brand.name}</p>
        <p className="kitchen-ticket__title">COMANDA COCINA</p>
      </header>

      <div className="kitchen-ticket__divider" />

      <section className="kitchen-ticket__meta">
        <p className="kitchen-ticket__order-label">{orderLabel}</p>
        <p>#{order.id.slice(0, 8).toUpperCase()}</p>
        <p>{formatTicketDateTime(printedAt)}</p>
      </section>

      {order.order_type === 'delivery' && (
        <>
          <div className="kitchen-ticket__divider" />
          <section className="kitchen-ticket__delivery">
            <p>
              <strong>{order.customer_name}</strong>
            </p>
            <p>{order.customer_phone}</p>
            <p>{order.delivery_address}</p>
            {order.delivery_notes && <p className="kitchen-ticket__notes">{order.delivery_notes}</p>}
          </section>
        </>
      )}

      <div className="kitchen-ticket__divider" />

      <section className="kitchen-ticket__items">
        {items.map((item) => {
          const preferences = getItemPreferenceLabel(item);

          return (
            <div key={item.id} className="kitchen-ticket__item">
              <p className="kitchen-ticket__item-row">
                <span className="kitchen-ticket__qty">{item.quantity}x</span>
                <span className="kitchen-ticket__name">{item.product_name}</span>
              </p>
              {preferences && <p className="kitchen-ticket__item-notes">* {preferences}</p>}
            </div>
          );
        })}
      </section>

      <div className="kitchen-ticket__divider" />

      <footer className="kitchen-ticket__footer">
        <p>
          {items.length} producto{items.length === 1 ? '' : 's'} ·{' '}
          {items.reduce((sum, item) => sum + item.quantity, 0)} unidades
        </p>
      </footer>
    </article>
  );
}
