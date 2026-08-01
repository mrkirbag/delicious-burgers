import {
  BarChart3,
  Bike,
  CreditCard,
  Download,
  Loader2,
  Package,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Alert, EmptyState, SkeletonGrid } from '@/components/ui/Feedback';
import { useSalesReport, type ReportFilters } from '@/lib/hooks/queries/useReports';
import { getPaymentLabel } from '@/lib/payments/methods';
import { withAppProviders } from '@/lib/providers/withAppProviders';
import { downloadSalesReportPdf } from '@/lib/reports/export-sales-report-pdf';
import { formatCop } from '@/lib/utils/currency';

import './ReportsDashboard.css';

const CHART_COLORS = [
  '#c45c26',
  '#2d6a4f',
  '#40916c',
  '#1d3557',
  '#e9c46a',
  '#f4a261',
  '#264653',
  '#6d6875',
];

function firstDayOfMonthISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultFilters = (): ReportFilters => ({
  dateFrom: firstDayOfMonthISO(),
  dateTo: todayISO(),
});

function formatChartDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function formatCompactCop(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

type ReportPanelProps = {
  icon: ReactNode;
  title: string;
  description: string;
  highlight?: { label: string; value: string };
  children: ReactNode;
  table?: ReactNode;
  className?: string;
};

function ReportPanel({
  icon,
  title,
  description,
  highlight,
  children,
  table,
  className = '',
}: ReportPanelProps) {
  return (
    <section className={`report-panel ${className}`.trim()}>
      <header className="report-panel__header">
        <div className="report-panel__heading">
          <div className="report-panel__icon" aria-hidden>
            {icon}
          </div>
          <div>
            <p className="report-panel__eyebrow">Reporte</p>
            <h2 className="report-panel__title">{title}</h2>
            <p className="report-panel__description">{description}</p>
          </div>
        </div>
        {highlight && (
          <div className="report-panel__highlight">
            <span>{highlight.label}</span>
            <strong>{highlight.value}</strong>
          </div>
        )}
      </header>
      <div className="report-panel__chart">{children}</div>
      {table}
    </section>
  );
}

function DataTable({
  columns,
  rows,
  footer,
}: {
  columns: string[];
  rows: (string | number)[][];
  footer?: (string | number)[];
}) {
  return (
    <div className="report-panel__table-wrap">
      <table className="report-panel__table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {footer.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

type SalesTooltipProps = {
  active?: boolean;
  payload?: { payload?: { date: string; total: number; count: number } }[];
};

function SalesTooltip({ active, payload }: SalesTooltipProps) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="reports-dashboard__tooltip">
      <p className="reports-dashboard__tooltip-label">{formatChartDate(data.date)}</p>
      <p>
        <strong>Ventas:</strong> {formatCop(data.total)}
      </p>
      <p>
        <strong>Pedidos:</strong> {data.count}
      </p>
    </div>
  );
}

function ReportsDashboard() {
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(defaultFilters);
  const { report, isLoading, isFetching, error } = useSalesReport(appliedFilters);

  const loadError =
    error instanceof Error ? error.message : error ? 'No se pudieron cargar los reportes' : '';

  const salesByDayChart = useMemo(
    () =>
      (report?.sales_by_day ?? []).map((item) => ({
        ...item,
        label: formatShortDate(item.date),
      })),
    [report?.sales_by_day],
  );

  const topProductsChart = useMemo(
    () =>
      (report?.top_products ?? []).map((item, index) => ({
        rank: index + 1,
        name: item.product_name,
        total: item.total,
        quantity: item.quantity,
      })),
    [report?.top_products],
  );

  const paymentMethodsChart = useMemo(() => {
    const total = (report?.payment_methods ?? []).reduce((sum, item) => sum + item.total_cop, 0);
    return (report?.payment_methods ?? []).map((item) => ({
      name: getPaymentLabel(item.payment_method, item.foreign_currency),
      value: item.total_cop,
      count: item.count,
      percent: total > 0 ? (item.total_cop / total) * 100 : 0,
    }));
  }, [report?.payment_methods]);

  const orderTypesChart = useMemo(() => {
    const total = (report?.order_types ?? []).reduce((sum, item) => sum + item.total, 0);
    return (report?.order_types ?? []).map((item) => ({
      name: item.order_type === 'mesa' ? 'Mesas' : 'Domicilios',
      value: item.total,
      count: item.count,
      percent: total > 0 ? (item.total / total) * 100 : 0,
    }));
  }, [report?.order_types]);

  const paymentTotal = paymentMethodsChart.reduce((sum, item) => sum + item.value, 0);
  const channelTotal = orderTypesChart.reduce((sum, item) => sum + item.value, 0);
  const hasData = (report?.summary.order_count ?? 0) > 0;

  return (
    <div className="reports-dashboard">
      <form
        className="reports-dashboard__filters"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedFilters({ ...draftFilters });
        }}
      >
        <label className="reports-dashboard__filter">
          Desde
          <input
            type="date"
            value={draftFilters.dateFrom}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            className="reports-dashboard__input"
          />
        </label>

        <label className="reports-dashboard__filter">
          Hasta
          <input
            type="date"
            value={draftFilters.dateTo}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
            className="reports-dashboard__input"
          />
        </label>

        <button type="submit" className="reports-dashboard__filter-btn" disabled={isFetching}>
          {isFetching ? <Loader2 className="reports-dashboard__spin" size={16} /> : 'Buscar'}
        </button>

        <button
          type="button"
          className="reports-dashboard__download-btn"
          disabled={isLoading || isFetching || !hasData || !report}
          title={!hasData ? 'No hay ventas para exportar' : 'Descargar reportes en PDF'}
          onClick={() => {
            if (!report) return;
            downloadSalesReportPdf({
              dateFrom: appliedFilters.dateFrom,
              dateTo: appliedFilters.dateTo,
              report,
            });
          }}
        >
          <Download size={16} />
          Descargar PDF
        </button>
      </form>

      {loadError && <Alert>{loadError}</Alert>}

      {isLoading ? (
        <SkeletonGrid count={4} />
      ) : !report || !hasData ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="No hay ventas en el rango seleccionado."
        />
      ) : (
        <>
          <div className="reports-dashboard__period">
            <span>Período analizado</span>
            <strong>
              {formatChartDate(appliedFilters.dateFrom)} — {formatChartDate(appliedFilters.dateTo)}
            </strong>
          </div>

          <section className="reports-dashboard__summary" aria-label="Resumen del período">
            <article className="reports-dashboard__card reports-dashboard__card--primary">
              <Wallet size={20} />
              <span>Total ventas</span>
              <strong>{formatCop(report.summary.total_sales)}</strong>
            </article>
            <article className="reports-dashboard__card">
              <Package size={20} />
              <span>Pedidos cobrados</span>
              <strong>{report.summary.order_count}</strong>
            </article>
            <article className="reports-dashboard__card">
              <TrendingUp size={20} />
              <span>Ticket promedio</span>
              <strong>{formatCop(report.summary.average_ticket)}</strong>
            </article>
            <article className="reports-dashboard__card">
              <UtensilsCrossed size={20} />
              <span>Ventas en mesas</span>
              <strong>{formatCop(report.summary.mesa_sales)}</strong>
              <small>{report.summary.mesa_count} pedidos</small>
            </article>
            <article className="reports-dashboard__card">
              <Bike size={20} />
              <span>Ventas en domicilios</span>
              <strong>{formatCop(report.summary.delivery_sales)}</strong>
              <small>{report.summary.delivery_count} pedidos</small>
            </article>
            <article className="reports-dashboard__card">
              <BarChart3 size={20} />
              <span>Días con ventas</span>
              <strong>{report.sales_by_day.length}</strong>
            </article>
          </section>

          <ReportPanel
            icon={<TrendingUp size={22} />}
            title="Ventas por día"
            description="Evolución diaria de ingresos y cantidad de pedidos cobrados en el período."
            highlight={{
              label: 'Promedio diario',
              value: formatCop(
                report.sales_by_day.length > 0
                  ? report.summary.total_sales / report.sales_by_day.length
                  : 0,
              ),
            }}
            table={
              <DataTable
                columns={['Fecha', 'Pedidos', 'Ventas']}
                rows={report.sales_by_day.map((day) => [
                  formatChartDate(day.date),
                  day.count,
                  formatCop(day.total),
                ])}
                footer={[
                  'Total',
                  report.summary.order_count,
                  formatCop(report.summary.total_sales),
                ]}
              />
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByDayChart} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
                <YAxis
                  tickFormatter={formatCompactCop}
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                  width={52}
                />
                <Tooltip content={<SalesTooltip />} />
                <Bar
                  dataKey="total"
                  name="Ventas"
                  fill="var(--color-primary)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </ReportPanel>

          <div className="reports-dashboard__grid">
            <ReportPanel
              icon={<Package size={22} />}
              title="Productos más vendidos"
              description="Ranking por ingresos generados. Incluye cantidad de unidades vendidas."
              highlight={{
                label: 'Productos listados',
                value: String(topProductsChart.length),
              }}
              table={
                <DataTable
                  columns={['#', 'Producto', 'Unidades', 'Ventas']}
                  rows={topProductsChart.map((item) => [
                    item.rank,
                    item.name,
                    item.quantity,
                    formatCop(item.total),
                  ])}
                  footer={[
                    '',
                    'Total top',
                    topProductsChart.reduce((sum, item) => sum + item.quantity, 0),
                    formatCop(topProductsChart.reduce((sum, item) => sum + item.total, 0)),
                  ]}
                />
              }
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={topProductsChart}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={formatCompactCop}
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--color-text)' }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      name === 'Ventas' && typeof value === 'number' ? formatCop(value) : value,
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                  <Bar dataKey="total" name="Ventas" fill="#2d6a4f" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ReportPanel>

            <ReportPanel
              icon={<CreditCard size={22} />}
              title="Métodos de pago"
              description="Distribución de cobros por forma de pago. Montos en equivalente COP."
              highlight={{
                label: 'Total cobrado',
                value: formatCop(paymentTotal),
              }}
              table={
                <DataTable
                  columns={['Método', 'Cobros', 'Participación', 'Total COP']}
                  rows={paymentMethodsChart.map((item) => [
                    item.name,
                    item.count,
                    `${item.percent.toFixed(1)}%`,
                    formatCop(item.value),
                  ])}
                  footer={['Total', '', '100%', formatCop(paymentTotal)]}
                />
              }
            >
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={paymentMethodsChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={96}
                    paddingAngle={2}
                  >
                    {paymentMethodsChart.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => (typeof value === 'number' ? formatCop(value) : '')} />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: '0.75rem', paddingTop: '0.75rem' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ReportPanel>
          </div>

          <ReportPanel
            icon={<UtensilsCrossed size={22} />}
            title="Canales de venta"
            description="Comparación entre pedidos en mesa y pedidos a domicilio."
            highlight={{
              label: 'Canal principal',
              value:
                report.summary.mesa_sales >= report.summary.delivery_sales ? 'Mesas' : 'Domicilios',
            }}
            className="report-panel--channels"
            table={
              <DataTable
                columns={['Canal', 'Pedidos', 'Participación', 'Ventas']}
                rows={orderTypesChart.map((item) => [
                  item.name,
                  item.count,
                  `${item.percent.toFixed(1)}%`,
                  formatCop(item.value),
                ])}
                footer={['Total', report.summary.order_count, '100%', formatCop(channelTotal)]}
              />
            }
          >
            <div className="report-panel__channels">
              <div className="report-panel__channels-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={orderTypesChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {orderTypesChart.map((_, index) => (
                        <Cell
                          key={index}
                          fill={index === 0 ? 'var(--color-primary)' : '#2d6a4f'}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => (typeof value === 'number' ? formatCop(value) : '')} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="report-panel__channels-stats">
                {orderTypesChart.map((item, index) => (
                  <article
                    key={item.name}
                    className={`report-panel__channel-card report-panel__channel-card--${index}`}
                  >
                    <span
                      className="report-panel__channel-dot"
                      style={{
                        background: index === 0 ? 'var(--color-primary)' : '#2d6a4f',
                      }}
                    />
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.count} pedidos · {item.percent.toFixed(1)}% del total</p>
                    </div>
                    <strong>{formatCop(item.value)}</strong>
                  </article>
                ))}
              </div>
            </div>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

export default withAppProviders(ReportsDashboard);
