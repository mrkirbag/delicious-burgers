import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { brand } from '@/data/brand';
import type { PaymentMethodBreakdown } from '@/lib/db/cash-registers';
import type { PaidOrderWithPayments } from '@/lib/db/orders';
import { formatBs, formatCop, formatUsd } from '@/lib/utils/currency';
import { getPaymentLabel } from '@/lib/payments/methods';

import {
  buildOrderPaymentRows,
  formatPaymentAmount,
  formatPaymentMethodLabel,
  groupOrderPaymentRows,
} from './order-rows';

type DayOrdersPdfInput = {
  date: string;
  orders: PaidOrderWithPayments[];
  paymentBreakdown: PaymentMethodBreakdown[];
  summary: {
    openingCop: number;
    openingUsd: number;
    closingCop: number;
    closingUsd: number;
    totalSales: number;
    totalOrders: number;
  };
};

function formatBreakdownAmount(line: PaymentMethodBreakdown): string {
  if (line.total_foreign != null && line.foreign_currency === 'usd') {
    return formatUsd(line.total_foreign);
  }
  if (line.total_foreign != null && line.foreign_currency === 'bs') {
    return formatBs(line.total_foreign);
  }
  return formatCop(line.total_cop);
}

export function downloadDayOrdersPdf({
  date,
  orders,
  paymentBreakdown,
  summary,
}: DayOrdersPdfInput): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rows = buildOrderPaymentRows(orders);
  const groups = groupOrderPaymentRows(rows);
  const tableBody: string[][] = [];

  for (const group of groups) {
    group.forEach((row) => {
      tableBody.push([
        row.showOrderMeta ? row.orderLabel : '',
        row.showOrderMeta ? row.time : '',
        row.showOrderMeta ? formatCop(row.orderTotal) : '',
        formatPaymentMethodLabel(row.payment),
        formatPaymentAmount(row.payment),
        formatCop(row.payment.amount_cop),
      ]);
    });
    tableBody.push(['', '', '', '', '', '']);
  }

  if (tableBody.length > 0) {
    tableBody.pop();
  }

  doc.setFontSize(16);
  doc.text(`${brand.name} — Flujo de caja`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Fecha: ${date}`, 14, 23);
  doc.text(`Pedidos: ${summary.totalOrders} · Ventas: ${formatCop(summary.totalSales)}`, 14, 29);
  doc.text(
    `Aperturas: ${formatCop(summary.openingCop)} / ${formatUsd(summary.openingUsd)} · Cierres contados: ${formatCop(summary.closingCop)} / ${formatUsd(summary.closingUsd)}`,
    14,
    35,
  );

  autoTable(doc, {
    startY: 42,
    head: [['Comanda', 'Hora', 'Total pedido', 'Método de pago', 'Monto cobrado', 'Equiv. COP']],
    body: tableBody,
    foot: [['', '', '', '', 'Total del día', formatCop(summary.totalSales)]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
    theme: 'grid',
    didParseCell(data) {
      const rowIndex = data.row.index;
      const isSpacer = data.section === 'body' && data.cell.raw === '';
      if (isSpacer && data.column.index === 0) {
        data.cell.styles.fillColor = [250, 250, 250];
        data.cell.styles.minCellHeight = 3;
      }

      if (data.section === 'body' && rowIndex < tableBody.length) {
        const row = tableBody[rowIndex];
        const isGroupStart = Boolean(row[0]);
        if (isGroupStart) {
          data.cell.styles.fontStyle = data.column.index <= 2 ? 'bold' : 'normal';
        }
      }
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 42;

  if (paymentBreakdown.length > 0) {
    autoTable(doc, {
      startY: finalY + 8,
      head: [['Totales por método de pago', 'Monto cobrado', 'Equiv. COP']],
      body: paymentBreakdown.map((line) => [
        getPaymentLabel(line.payment_method, line.foreign_currency),
        formatBreakdownAmount(line),
        formatCop(line.total_cop),
      ]),
      foot: [
        [
          'Total',
          '',
          formatCop(paymentBreakdown.reduce((sum, line) => sum + line.total_cop, 0)),
        ],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
      theme: 'grid',
    });
  }

  doc.save(`flujo-caja-${date}.pdf`);
}
