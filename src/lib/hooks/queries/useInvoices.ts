import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { InvoiceListItem, OrderItemWithProduct } from '@/lib/db/orders';
import type { Order, OrderPayment } from '@/lib/db/types';
import { queryKeys } from '@/lib/query/keys';

export type InvoiceFilters = {
  dateFrom: string;
  dateTo: string;
  tableId: string;
  cashierId: string;
};

export type InvoiceFilterOption = { id: string; number?: string; username?: string };

export type InvoicesData = {
  invoices: InvoiceListItem[];
  tables: InvoiceFilterOption[];
  cashiers: InvoiceFilterOption[];
};

export type InvoiceDetail = {
  order: Order;
  items: OrderItemWithProduct[];
  payments: OrderPayment[];
  table_number: string | null;
  cashier_username: string;
};

async function fetchInvoices(filters: InvoiceFilters): Promise<InvoicesData> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.tableId) params.set('table_id', filters.tableId);
  if (filters.cashierId) params.set('cashier_id', filters.cashierId);

  const data = await fetchJson<{
    invoices: InvoiceListItem[];
    filters?: { tables?: InvoiceFilterOption[]; cashiers?: InvoiceFilterOption[] };
  }>(`/api/invoices?${params.toString()}`);

  return {
    invoices: data.invoices ?? [],
    tables: data.filters?.tables ?? [],
    cashiers: data.filters?.cashiers ?? [],
  };
}

export function useInvoices(filters: InvoiceFilters, enabled = true) {
  const query = useQuery({
    queryKey: [...queryKeys.invoices, filters] as const,
    queryFn: () => fetchInvoices(filters),
    enabled,
  });

  return {
    invoices: query.data?.invoices ?? [],
    tables: query.data?.tables ?? [],
    cashiers: query.data?.cashiers ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useInvoiceDetail(invoiceId: string | null) {
  const query = useQuery({
    queryKey: [...queryKeys.invoices, 'detail', invoiceId] as const,
    queryFn: () => fetchJson<InvoiceDetail>(`/api/invoices/${invoiceId}`),
    enabled: Boolean(invoiceId),
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
