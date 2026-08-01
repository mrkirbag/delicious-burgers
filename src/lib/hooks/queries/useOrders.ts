import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { OrderListItem } from '@/lib/db/orders';
import { queryKeys } from '@/lib/query/keys';
import { POLL_INTERVALS, pollingRefetchInterval } from '@/lib/query/polling';

type OrdersResponse = { orders: OrderListItem[] };

type UseOrdersOptions = {
  pendingPayment?: boolean;
  enabled?: boolean;
};

async function fetchOrders(options: UseOrdersOptions): Promise<OrderListItem[]> {
  const params = options.pendingPayment ? '?pending_payment=1' : '';
  const data = await fetchJson<OrdersResponse>(`/api/orders${params}`);
  return data.orders ?? [];
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { pendingPayment = false, enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.orders({ pendingPayment }),
    queryFn: () => fetchOrders({ pendingPayment }),
    enabled,
    refetchInterval: pollingRefetchInterval(POLL_INTERVALS.operational),
  });

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error,
    refetch: query.refetch,
  };
}
