import { useRef } from 'react';
import { Printer, X } from 'lucide-react';

import type { OrderItemWithProduct } from '@/lib/db/orders';
import type { Order } from '@/lib/db/types';
import { useModalBodyLock } from '@/lib/ui/modal-utils';

import KitchenTicket from './KitchenTicket';
import './KitchenTicketModal.css';

type KitchenTicketModalProps = {
  order: Order;
  items: OrderItemWithProduct[];
  tableNumber?: string | null;
  sentAt?: string;
  onClose: () => void;
};

export default function KitchenTicketModal({
  order,
  items,
  tableNumber,
  sentAt,
  onClose,
}: KitchenTicketModalProps) {
  const backdropPointerDownRef = useRef(false);

  useModalBodyLock(true);

  function handlePrint() {
    window.print();
  }

  return (
    <div
      className="kitchen-ticket-modal__overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          backdropPointerDownRef.current = true;
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropPointerDownRef.current) {
          onClose();
        }
        backdropPointerDownRef.current = false;
      }}
    >
      <div
        className="kitchen-ticket-modal"
        role="dialog"
        aria-labelledby="kitchen-ticket-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="kitchen-ticket-modal__header">
          <div>
            <p className="kitchen-ticket-modal__eyebrow">Impresión térmica 50 mm</p>
            <h3 id="kitchen-ticket-modal-title">Ticket de cocina</h3>
          </div>
          <button
            type="button"
            className="kitchen-ticket-modal__close"
            onClick={onClose}
            aria-label="Cancelar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="kitchen-ticket-modal__preview">
          <KitchenTicket
            order={order}
            items={items}
            tableNumber={tableNumber}
            sentAt={sentAt}
          />
        </div>

        <footer className="kitchen-ticket-modal__footer">
          <button
            type="button"
            className="kitchen-ticket-modal__btn kitchen-ticket-modal__btn--ghost"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="kitchen-ticket-modal__btn kitchen-ticket-modal__btn--primary"
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
