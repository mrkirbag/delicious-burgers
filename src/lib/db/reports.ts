import { db } from './client';
import type { SqlArgs } from './sql';
import type { ForeignCurrency, OrderType, PaymentMethod } from './types';

export type SalesReportFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type SalesReportSummary = {
  total_sales: number;
  order_count: number;
  average_ticket: number;
  mesa_sales: number;
  delivery_sales: number;
  mesa_count: number;
  delivery_count: number;
};

export type SalesByDay = {
  date: string;
  total: number;
  count: number;
};

export type TopProduct = {
  product_name: string;
  quantity: number;
  total: number;
};

export type PaymentMethodReport = {
  payment_method: PaymentMethod;
  foreign_currency: ForeignCurrency | null;
  total_cop: number;
  count: number;
};

export type OrderTypeReport = {
  order_type: OrderType;
  total: number;
  count: number;
};

export type SalesReport = {
  summary: SalesReportSummary;
  sales_by_day: SalesByDay[];
  top_products: TopProduct[];
  payment_methods: PaymentMethodReport[];
  order_types: OrderTypeReport[];
};

function buildPaidOrderFilter(filters: SalesReportFilters): {
  conditions: string[];
  args: SqlArgs;
} {
  const conditions = ['o.cash_register_id IS NOT NULL'];
  const args: SqlArgs = [];

  if (filters.dateFrom) {
    conditions.push('o.updated_at >= ?');
    args.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push('o.updated_at <= ?');
    args.push(`${filters.dateTo}T23:59:59.999Z`);
  }

  return { conditions, args };
}

export async function getSalesReport(filters: SalesReportFilters = {}): Promise<SalesReport> {
  const { conditions, args } = buildPaidOrderFilter(filters);
  const whereClause = conditions.join(' AND ');

  const [summaryResult, salesByDayResult, topProductsResult, paymentMethodsResult, orderTypesResult] =
    await Promise.all([
      db.execute({
        sql: `
          SELECT
            COALESCE(SUM(o.total), 0) AS total_sales,
            COUNT(*) AS order_count,
            COALESCE(SUM(CASE WHEN o.order_type = 'mesa' THEN o.total ELSE 0 END), 0) AS mesa_sales,
            COALESCE(SUM(CASE WHEN o.order_type = 'delivery' THEN o.total ELSE 0 END), 0) AS delivery_sales,
            COALESCE(SUM(CASE WHEN o.order_type = 'mesa' THEN 1 ELSE 0 END), 0) AS mesa_count,
            COALESCE(SUM(CASE WHEN o.order_type = 'delivery' THEN 1 ELSE 0 END), 0) AS delivery_count
          FROM orders o
          WHERE ${whereClause}
        `,
        args,
      }),
      db.execute({
        sql: `
          SELECT
            strftime('%Y-%m-%d', o.updated_at) AS date,
            COALESCE(SUM(o.total), 0) AS total,
            COUNT(*) AS count
          FROM orders o
          WHERE ${whereClause}
          GROUP BY strftime('%Y-%m-%d', o.updated_at)
          ORDER BY date ASC
        `,
        args,
      }),
      db.execute({
        sql: `
          SELECT
            p.name AS product_name,
            COALESCE(SUM(oi.quantity), 0) AS quantity,
            COALESCE(SUM(oi.quantity * oi.price_at_sale), 0) AS total
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          INNER JOIN products p ON p.id = oi.product_id
          WHERE ${whereClause}
          GROUP BY p.id, p.name
          ORDER BY total DESC
          LIMIT 10
        `,
        args,
      }),
      db.execute({
        sql: `
          SELECT
            op.payment_method,
            op.foreign_currency,
            COALESCE(SUM(op.amount_cop), 0) AS total_cop,
            COUNT(*) AS count
          FROM order_payments op
          INNER JOIN orders o ON o.id = op.order_id
          WHERE ${whereClause}
          GROUP BY op.payment_method, op.foreign_currency
          ORDER BY total_cop DESC
        `,
        args,
      }),
      db.execute({
        sql: `
          SELECT
            o.order_type,
            COALESCE(SUM(o.total), 0) AS total,
            COUNT(*) AS count
          FROM orders o
          WHERE ${whereClause}
          GROUP BY o.order_type
          ORDER BY total DESC
        `,
        args,
      }),
    ]);

  const summaryRow = summaryResult.rows[0] as Record<string, unknown>;
  const totalSales = Number(summaryRow.total_sales);
  const orderCount = Number(summaryRow.order_count);

  return {
    summary: {
      total_sales: totalSales,
      order_count: orderCount,
      average_ticket: orderCount > 0 ? totalSales / orderCount : 0,
      mesa_sales: Number(summaryRow.mesa_sales),
      delivery_sales: Number(summaryRow.delivery_sales),
      mesa_count: Number(summaryRow.mesa_count),
      delivery_count: Number(summaryRow.delivery_count),
    },
    sales_by_day: salesByDayResult.rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        date: String(record.date),
        total: Number(record.total),
        count: Number(record.count),
      };
    }),
    top_products: topProductsResult.rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        product_name: String(record.product_name),
        quantity: Number(record.quantity),
        total: Number(record.total),
      };
    }),
    payment_methods: paymentMethodsResult.rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        payment_method: record.payment_method as PaymentMethod,
        foreign_currency: record.foreign_currency
          ? (String(record.foreign_currency) as ForeignCurrency)
          : null,
        total_cop: Number(record.total_cop),
        count: Number(record.count),
      };
    }),
    order_types: orderTypesResult.rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        order_type: record.order_type as OrderType,
        total: Number(record.total),
        count: Number(record.count),
      };
    }),
  };
}
