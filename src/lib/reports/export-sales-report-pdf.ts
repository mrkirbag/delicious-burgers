import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { brand } from '@/data/brand';
import type { SalesReport } from '@/lib/db/reports';
import { getPaymentLabel } from '@/lib/payments/methods';
import { formatCop } from '@/lib/utils/currency';

type SalesReportPdfInput = {
  dateFrom: string;
  dateTo: string;
  report: SalesReport;
};

type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

const TABLE_OPTS = {
  styles: { fontSize: 8, cellPadding: 2 },
  headStyles: { fillColor: [40, 40, 40] as [number, number, number] },
  footStyles: {
    fillColor: [245, 245, 245] as [number, number, number],
    textColor: [20, 20, 20] as [number, number, number],
    fontStyle: 'bold' as const,
  },
  theme: 'grid' as const,
};

function formatChartDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function getFinalY(doc: jsPDF): number {
  return (doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? 14;
}

function addSectionTitle(doc: jsPDF, y: number, title: string): number {
  const margin = 14;
  let nextY = y;

  if (nextY > 250) {
    doc.addPage();
    nextY = 20;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, nextY);
  doc.setFont('helvetica', 'normal');
  return nextY + 6;
}

export function downloadSalesReportPdf({ dateFrom, dateTo, report }: SalesReportPdfInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const { summary } = report;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${brand.name} — Reportes de ventas`, margin, 16);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${formatChartDate(dateFrom)} — ${formatChartDate(dateTo)}`, margin, 23);
  doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, margin, 29);

  autoTable(doc, {
    startY: 36,
    head: [['Resumen del período', 'Valor']],
    body: [
      ['Total ventas', formatCop(summary.total_sales)],
      ['Pedidos cobrados', String(summary.order_count)],
      ['Ticket promedio', formatCop(summary.average_ticket)],
      ['Ventas en mesas', `${formatCop(summary.mesa_sales)} (${summary.mesa_count} pedidos)`],
      [
        'Ventas en domicilios',
        `${formatCop(summary.delivery_sales)} (${summary.delivery_count} pedidos)`,
      ],
      ['Días con ventas', String(report.sales_by_day.length)],
    ],
    ...TABLE_OPTS,
  });

  let y = getFinalY(doc) + 10;

  y = addSectionTitle(doc, y, '1. Ventas por día');
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Pedidos', 'Ventas']],
    body: report.sales_by_day.map((day) => [
      formatChartDate(day.date),
      String(day.count),
      formatCop(day.total),
    ]),
    foot: [['Total', String(summary.order_count), formatCop(summary.total_sales)]],
    ...TABLE_OPTS,
  });

  y = getFinalY(doc) + 10;

  y = addSectionTitle(doc, y, '2. Productos más vendidos');
  const topTotal = report.top_products.reduce((sum, item) => sum + item.total, 0);
  const topQty = report.top_products.reduce((sum, item) => sum + item.quantity, 0);
  autoTable(doc, {
    startY: y,
    head: [['#', 'Producto', 'Unidades', 'Ventas']],
    body: report.top_products.map((item, index) => [
      String(index + 1),
      item.product_name,
      String(item.quantity),
      formatCop(item.total),
    ]),
    foot: [['', 'Total top', String(topQty), formatCop(topTotal)]],
    ...TABLE_OPTS,
  });

  y = getFinalY(doc) + 10;

  y = addSectionTitle(doc, y, '3. Métodos de pago');
  const paymentTotal = report.payment_methods.reduce((sum, item) => sum + item.total_cop, 0);
  autoTable(doc, {
    startY: y,
    head: [['Método', 'Cobros', 'Participación', 'Total COP']],
    body: report.payment_methods.map((item) => [
      getPaymentLabel(item.payment_method, item.foreign_currency),
      String(item.count),
      paymentTotal > 0 ? `${((item.total_cop / paymentTotal) * 100).toFixed(1)}%` : '0%',
      formatCop(item.total_cop),
    ]),
    foot: [['Total', '', '100%', formatCop(paymentTotal)]],
    ...TABLE_OPTS,
  });

  y = getFinalY(doc) + 10;

  y = addSectionTitle(doc, y, '4. Canales de venta');
  const channelTotal = report.order_types.reduce((sum, item) => sum + item.total, 0);
  autoTable(doc, {
    startY: y,
    head: [['Canal', 'Pedidos', 'Participación', 'Ventas']],
    body: report.order_types.map((item) => [
      item.order_type === 'mesa' ? 'Mesas' : 'Domicilios',
      String(item.count),
      channelTotal > 0 ? `${((item.total / channelTotal) * 100).toFixed(1)}%` : '0%',
      formatCop(item.total),
    ]),
    foot: [['Total', String(summary.order_count), '100%', formatCop(channelTotal)]],
    ...TABLE_OPTS,
  });

  doc.save(`reportes-${dateFrom}_${dateTo}.pdf`);
}
