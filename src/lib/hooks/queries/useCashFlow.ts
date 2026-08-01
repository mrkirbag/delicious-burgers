import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { CashRegisterSummary, PaymentMethodBreakdown } from '@/lib/db/cash-registers';
import type { PaidOrderWithPayments } from '@/lib/db/orders';
import type { CashRegisterStatus } from '@/lib/db/types';
import { queryKeys } from '@/lib/query/keys';

export type CashFlowFilters = {
  date: string;
  openedBy: string;
  status: CashRegisterStatus | 'all';
};

export type CashierOption = { id: string; username: string };

export type CashFlowData = {
  sessions: CashRegisterSummary[];
  orders: PaidOrderWithPayments[];
  paymentBreakdown: PaymentMethodBreakdown[];
  cashiers: CashierOption[];
};

export type CashFlowDetail = {
  session: CashRegisterSummary;
  paymentBreakdown: PaymentMethodBreakdown[];
  orders: PaidOrderWithPayments[];
};

async function fetchCashFlow(filters: CashFlowFilters): Promise<CashFlowData> {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.openedBy) params.set('opened_by', filters.openedBy);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);

  const data = await fetchJson<{
    sessions: CashRegisterSummary[];
    orders?: PaidOrderWithPayments[];
    paymentBreakdown?: PaymentMethodBreakdown[];
    filters?: { cashiers?: CashierOption[] };
  }>(`/api/cash-flow?${params.toString()}`);

  return {
    sessions: data.sessions ?? [],
    orders: data.orders ?? [],
    paymentBreakdown: data.paymentBreakdown ?? [],
    cashiers: data.filters?.cashiers ?? [],
  };
}

export function useCashFlow(filters: CashFlowFilters) {
  const query = useQuery({
    queryKey: [...queryKeys.cashFlow, filters] as const,
    queryFn: () => fetchCashFlow(filters),
  });

  return {
    sessions: query.data?.sessions ?? [],
    orders: query.data?.orders ?? [],
    paymentBreakdown: query.data?.paymentBreakdown ?? [],
    cashiers: query.data?.cashiers ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCashFlowDetail(sessionId: string | null) {
  const query = useQuery({
    queryKey: [...queryKeys.cashFlow, 'detail', sessionId] as const,
    queryFn: () => fetchJson<CashFlowDetail>(`/api/cash-flow/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
