import { Printer, X } from 'lucide-react';

import type { OrderItemWithProduct } from '@/lib/db/orders';
import type { Order, OrderPayment } from '@/lib/db/types';

import SaleTicket from './SaleTicket';
import './SaleTicketModal.css';

type SaleTicketModalProps = {
  order: Order;
  items: OrderItemWithProduct[];
  tableNumber?: string | null;
  cashierUsername?: string;
  payments?: OrderPayment[];
  paymentPreview?: string;
  title?: string;
  onClose: () => void;
};

export default function SaleTicketModal({
  order,
  items,
  tableNumber,
  cashierUsername,
  payments,
  paymentPreview,
  title = 'Ticket de venta',
  onClose,
}: SaleTicketModalProps) {
  function handlePrint() {
    window.print();
  }

  return (
    <div className="sale-ticket-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="sale-ticket-modal"
        role="dialog"
        aria-labelledby="sale-ticket-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sale-ticket-modal__header">
          <div>
            <p className="sale-ticket-modal__eyebrow">Impresión térmica 50 mm</p>
            <h3 id="sale-ticket-modal-title">{title}</h3>
          </div>
          <button
            type="button"
            className="sale-ticket-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="sale-ticket-modal__preview">
          <SaleTicket
            order={order}
            items={items}
            tableNumber={tableNumber}
            cashierUsername={cashierUsername}
            payments={payments}
            paymentPreview={paymentPreview}
          />
        </div>

        <footer className="sale-ticket-modal__footer">
          <button
            type="button"
            className="sale-ticket-modal__btn sale-ticket-modal__btn--ghost"
            onClick={onClose}
          >
            Cerrar
          </button>
          <button
            type="button"
            className="sale-ticket-modal__btn sale-ticket-modal__btn--primary"
            onClick={handlePrint}
          >
            <Printer size={16} />
            Imprimir
          </button>
        </footer>
      </div>
    </div>
  );
}
