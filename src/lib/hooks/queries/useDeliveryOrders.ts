import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { OrderListItem } from '@/lib/db/orders';
import { queryKeys } from '@/lib/query/keys';
import { POLL_INTERVALS, pollingRefetchInterval } from '@/lib/query/polling';

type OrdersResponse = { orders: OrderListItem[] };

async function fetchDeliveryOrders(): Promise<OrderListItem[]> {
  const data = await fetchJson<OrdersResponse>('/api/orders?type=delivery');
  return data.orders ?? [];
}

export function useDeliveryOrders() {
  const query = useQuery({
    queryKey: [...queryKeys.orders(), 'delivery'] as const,
    queryFn: fetchDeliveryOrders,
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
