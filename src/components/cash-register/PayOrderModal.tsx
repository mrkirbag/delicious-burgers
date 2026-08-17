import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Loader2, Plus, Printer, Receipt, Trash2, X } from 'lucide-react';

import SaleTicket from '@/components/tickets/SaleTicket';
import type { OrderItemWithProduct, OrderListItem } from '@/lib/db/orders';
import type { ExchangeRates, OrderPaymentInput } from '@/lib/db/types';
import { formatOrderLabel } from '@/lib/orders/display';
import { formatOrderPaymentPreview } from '@/lib/payments/display';
import {
  type ActivePaymentMethod,
  getPaymentAmountUnit,
  getPaymentLabel,
  isBsPaymentMethod,
  isCashPaymentMethod,
  isUsdPaymentMethod,
  PAYMENT_OPTION_GROUPS,
} from '@/lib/payments/methods';
import { payableAmountForMethod, payableForeignAmount, settlePaymentLines } from '@/lib/payments/settlement';
import { useModalBodyLock, usePreventNumberInputWheel } from '@/lib/ui/modal-utils';
import {
  convertUsdToCop,
  formatBs,
  formatCop,
  formatUsd,
} from '@/lib/utils/currency';

import './PayOrderModal.css';

type PaymentLine = {
  id: string;
  method: ActivePaymentMethod;
  amount: string;
  received: string;
};

type PayOrderModalProps = {
  order: OrderListItem;
  exchangeRates: ExchangeRates | null;
  cashierUsername?: string;
  acting: boolean;
  onClose: () => void;
  onConfirm: (payments: OrderPaymentInput[]) => void;
};

function createLineId(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCopWithoutSymbol(value: number): string {
  return `${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)} COP`;
}

function remainingExcludingLine(
  lines: PaymentLine[],
  lineId: string,
  orderTotal: number,
  rates: ExchangeRates | null,
): number {
  return settlePaymentLines(
    lines
      .filter((line) => line.id !== lineId)
      .map((line) => ({ method: line.method, amount: Number(line.amount) })),
    orderTotal,
    rates,
  ).remainingCop;
}

function getLineChange(line: PaymentLine): number {
  if (!isCashPaymentMethod(line.method)) return 0;

  const amount = Number(line.amount);
  const received = line.received.trim() ? Number(line.received) : amount;
  if (!Number.isFinite(amount) || !Number.isFinite(received) || received <= amount) {
    return 0;
  }

  return received - amount;
}

export default function PayOrderModal({
  order,
  exchangeRates,
  cashierUsername,
  acting,
  onClose,
  onConfirm,
}: PayOrderModalProps) {
  const [lines, setLines] = useState<PaymentLine[]>([
    { id: createLineId(), method: 'efectivo', amount: String(order.total), received: '' },
  ]);
  const [formError, setFormError] = useState('');
  const [showTicket, setShowTicket] = useState(false);
  const [items, setItems] = useState<OrderItemWithProduct[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = useRef(false);

  useModalBodyLock(true);
  usePreventNumberInputWheel(modalRef, true);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setItemsLoading(true);

      try {
        const response = await fetch(`/api/orders/${order.id}`);
        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [order.id]);

  const settlement = useMemo(
    () =>
      settlePaymentLines(
        lines.map((line) => ({ method: line.method, amount: Number(line.amount) })),
        order.total,
        exchangeRates,
      ),
    [lines, order.total, exchangeRates],
  );

  const paidCop = settlement.paidCop;
  const remainingCop = settlement.remainingCop;
  const isBalanced = Math.abs(remainingCop) < 0.5;

  const changeSummary = useMemo(() => {
    let copChange = 0;
    let usdChange = 0;

    for (const line of lines) {
      const change = getLineChange(line);
      if (change <= 0) continue;

      if (line.method === 'efectivo') {
        copChange += change;
      } else if (line.method === 'usd_efectivo') {
        usdChange += change;
      }
    }

    const usdChangeCop =
      usdChange > 0 && exchangeRates ? convertUsdToCop(usdChange, exchangeRates) : 0;

    return { copChange, usdChange, usdChangeCop };
  }, [lines, exchangeRates]);

  const needsExchangeRates = lines.some(
    (line) => isUsdPaymentMethod(line.method) || isBsPaymentMethod(line.method),
  );

  const paymentPreview = useMemo(() => {
    if (!isBalanced) {
      return 'Pendiente de cobro';
    }

    if (needsExchangeRates && !exchangeRates) {
      return 'Pendiente de cobro';
    }

    return formatOrderPaymentPreview(settlement.payments);
  }, [settlement.payments, isBalanced, needsExchangeRates, exchangeRates]);

  function updateLine(id: string, patch: Partial<PaymentLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;

        const next = { ...line, ...patch };
        if (patch.method) {
          if (!isCashPaymentMethod(patch.method)) {
            next.received = '';
          }

          if (patch.amount === undefined) {
            next.amount = payableAmountForMethod(
              patch.method,
              remainingExcludingLine(prev, id, order.total, exchangeRates),
              exchangeRates,
            );
          }
        }

        return next;
      }),
    );
    setFormError('');
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: createLineId(),
        method: 'efectivo',
        amount: payableAmountForMethod('efectivo', remainingCop, exchangeRates),
        received: '',
      },
    ]);
  }

  function fillRemaining(id: string) {
    const line = lines.find((item) => item.id === id);
    if (!line) return;

    const remaining = remainingExcludingLine(lines, id, order.total, exchangeRates);
    if (remaining <= 0) return;

    updateLine(id, { amount: payableAmountForMethod(line.method, remaining, exchangeRates) });
  }

  function removeLine(id: string) {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((line) => line.id !== id));
    setFormError('');
  }

  function handleConfirm() {
    if (needsExchangeRates && !exchangeRates) {
      setFormError('Las tasas de cambio son necesarias para pagos en dólares o bolívares');
      return;
    }

    if (!isBalanced) {
      setFormError('La suma de los pagos debe igualar el total');
      return;
    }

    for (const line of lines) {
      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError('Cada pago debe tener un monto mayor a 0');
        return;
      }

      if (isCashPaymentMethod(line.method)) {
        const received = line.received.trim() ? Number(line.received) : amount;
        if (!Number.isFinite(received) || received < amount) {
          setFormError('El monto recibido debe ser mayor o igual al monto a pagar');
          return;
        }
      }
    }

    onConfirm(settlement.payments);
  }

  return (
    <div
      ref={modalRef}
      className="pay-modal__overlay"
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
        className="pay-modal"
        role="dialog"
        aria-labelledby="pay-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pay-modal__header">
          <div>
            <p className="pay-modal__eyebrow">Cobrar comanda</p>
            <h3 id="pay-modal-title">{formatOrderLabel(order)}</h3>
          </div>
          <button type="button" className="pay-modal__close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="pay-modal__body">
          <div className="pay-modal__summary">
            <div>
              <span className="pay-modal__summary-label">Total</span>
              <strong>{formatCop(order.total)}</strong>
            </div>
            <div>
              <span className="pay-modal__summary-label">Pagado</span>
              <strong className={isBalanced ? 'pay-modal__summary--ok' : ''}>
                {formatCop(paidCop)}
              </strong>
            </div>
            <div>
              <span className="pay-modal__summary-label">Restante</span>
              <strong
                className={
                  remainingCop > 0.5
                    ? 'pay-modal__summary--pending'
                    : remainingCop < -0.5
                      ? 'pay-modal__summary--over'
                      : 'pay-modal__summary--ok'
                }
              >
                {formatCop(remainingCop)}
              </strong>
            </div>
          </div>

          {(changeSummary.copChange > 0 || changeSummary.usdChange > 0) && (
            <div className="pay-modal__change">
              <ArrowLeftRight size={16} />
              <div>
                <span className="pay-modal__change-label">Vueltos</span>
                <strong>
                  {changeSummary.copChange > 0 && formatCop(changeSummary.copChange)}
                  {changeSummary.copChange > 0 && changeSummary.usdChange > 0 && ' · '}
                  {changeSummary.usdChange > 0 && (
                    <>
                      {formatUsd(changeSummary.usdChange)}
                      {changeSummary.usdChangeCop > 0 && (
                        <> ({formatCopWithoutSymbol(changeSummary.usdChangeCop)})</>
                      )}
                    </>
                  )}
                </strong>
              </div>
            </div>
          )}

          {exchangeRates && (
            <p className="pay-modal__rates">
              Referencia al céntimo: {formatUsd(payableForeignAmount(order.total, exchangeRates.usd_rate))} ·{' '}
              {formatBs(payableForeignAmount(order.total, exchangeRates.bs_rate))}
            </p>
          )}

          <div className="pay-modal__ticket-toolbar">
            <button
              type="button"
              className="pay-modal__ticket-toggle"
              onClick={() => setShowTicket((value) => !value)}
              disabled={itemsLoading || items.length === 0}
            >
              <Receipt size={16} />
              {showTicket ? 'Ocultar ticket' : 'Ver ticket'}
            </button>
            {showTicket && (
              <button
                type="button"
                className="pay-modal__ticket-toggle"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                Imprimir
              </button>
            )}
          </div>

          {showTicket && !itemsLoading && items.length > 0 && (
            <div className="pay-modal__ticket-preview">
              <SaleTicket
                order={order}
                items={items}
                tableNumber={order.table_number}
                cashierUsername={cashierUsername}
                paymentPreview={paymentPreview}
              />
            </div>
          )}

          <div className="pay-modal__lines">
            {lines.map((line, index) => {
              const tender = settlement.tenders[index];
              const copEquivalent = tender?.amountCop ?? 0;
              const isUsd = isUsdPaymentMethod(line.method);
              const isBs = isBsPaymentMethod(line.method);
              const isForeign = isUsd || isBs;
              const isCash = isCashPaymentMethod(line.method);
              const lineChange = getLineChange(line);
              const unit = getPaymentAmountUnit(line.method);
              const lineRemaining = remainingExcludingLine(
                lines,
                line.id,
                order.total,
                exchangeRates,
              );

              return (
                <div key={line.id} className="pay-modal__line">
                  <div className="pay-modal__line-top">
                    <select
                      className="pay-modal__method"
                      value={line.method}
                      onChange={(e) =>
                        updateLine(line.id, {
                          method: e.target.value as ActivePaymentMethod,
                          received: '',
                        })
                      }
                    >
                      {PAYMENT_OPTION_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.methods.map((method) => (
                            <option key={method} value={method}>
                              {getPaymentLabel(method)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="pay-modal__remove"
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length === 1}
                      aria-label="Eliminar pago"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="pay-modal__line-amount">
                    <label className="pay-modal__amount-label">
                      A pagar ({unit})
                      <input
                        type="number"
                        min="0"
                        step={isForeign ? '0.01' : '1'}
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                        className="pay-modal__amount-input"
                        placeholder="0"
                      />
                    </label>
                    <button
                      type="button"
                      className="pay-modal__fill"
                      onClick={() => fillRemaining(line.id)}
                      disabled={lineRemaining <= 0.5}
                    >
                      Restante
                    </button>
                  </div>

                  {isForeign && (
                    <div className="pay-modal__cop-box">
                      <div className="pay-modal__cop-box-main">
                        <span className="pay-modal__cop-box-label">A cobrar en pesos (COP)</span>
                        <strong className="pay-modal__cop-box-value">
                          {exchangeRates
                            ? copEquivalent > 0
                              ? formatCop(copEquivalent)
                              : 'Ingresa el monto'
                            : 'Sin tasa de cambio'}
                        </strong>
                      </div>
                      {exchangeRates && (
                        <p className="pay-modal__cop-box-rate">
                          Tasa: 1 {isUsd ? 'USD' : 'BS'} ={' '}
                          {formatCop(isUsd ? exchangeRates.usd_rate : exchangeRates.bs_rate)}
                          {tender?.snappedToRemaining && (
                            <> · Ajustado al céntimo para cerrar la cuenta</>
                          )}
                          {remainingCop > 0.5 && !tender?.snappedToRemaining && (
                            <>
                              {' '}
                              · Restante:{' '}
                              {isUsd
                                ? formatUsd(
                                    payableForeignAmount(remainingCop, exchangeRates.usd_rate),
                                  )
                                : formatBs(
                                    payableForeignAmount(remainingCop, exchangeRates.bs_rate),
                                  )}{' '}
                              (≈ {formatCop(remainingCop)})
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {isCash && (
                    <div className="pay-modal__line-received">
                      <label className="pay-modal__amount-label">
                        Recibido ({unit})
                        <input
                          type="number"
                          min="0"
                          step={line.method === 'usd_efectivo' ? '0.01' : '1'}
                          value={line.received}
                          onChange={(e) => updateLine(line.id, { received: e.target.value })}
                          className="pay-modal__amount-input"
                          placeholder={line.amount || '0'}
                        />
                      </label>
                      {line.method === 'usd_efectivo' &&
                        exchangeRates &&
                        line.received.trim() &&
                        Number(line.received) > 0 && (
                          <p className="pay-modal__line-received-cop">
                            Recibido en pesos:{' '}
                            {formatCop(convertUsdToCop(Number(line.received), exchangeRates))}
                          </p>
                        )}
                      {lineChange > 0 && (
                        <p className="pay-modal__line-change">
                          Vuelto:{' '}
                          {line.method === 'usd_efectivo' ? (
                            <>
                              {formatUsd(lineChange)}
                              {exchangeRates && (
                                <> ({formatCopWithoutSymbol(convertUsdToCop(lineChange, exchangeRates))})</>
                              )}
                            </>
                          ) : (
                            formatCop(lineChange)
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="pay-modal__add" onClick={addLine}>
            <Plus size={16} />
            Agregar otro pago
          </button>

          {formError && <p className="pay-modal__error">{formError}</p>}
        </div>

        <footer className="pay-modal__footer">
          <button type="button" className="pay-modal__btn pay-modal__btn--outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="pay-modal__btn pay-modal__btn--primary"
            onClick={handleConfirm}
            disabled={acting || !isBalanced}
          >
            {acting ? <Loader2 className="pay-modal__spin" size={16} /> : <Receipt size={16} />}
            Confirmar cobro
          </button>
        </footer>
      </div>
    </div>
  );
}

export function formatPaymentLineLabel(payment: OrderPaymentInput): string {
  if (payment.foreign_currency === 'usd' && payment.foreign_amount != null) {
    return `${getPaymentLabel(payment.payment_method)} ${formatUsd(payment.foreign_amount)}`;
  }

  if (payment.foreign_currency === 'bs' && payment.foreign_amount != null) {
    return `${getPaymentLabel(payment.payment_method)} ${formatBs(payment.foreign_amount)}`;
  }

  return getPaymentLabel(payment.payment_method);
}
