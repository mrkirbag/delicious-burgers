import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { KitchenOrder } from '@/lib/db/orders';
import { queryKeys } from '@/lib/query/keys';
import { POLL_INTERVALS, pollingRefetchInterval } from '@/lib/query/polling';

type KitchenOrdersResponse = { orders: KitchenOrder[] };

async function fetchKitchenOrders(): Promise<KitchenOrder[]> {
  const data = await fetchJson<KitchenOrdersResponse>('/api/kitchen/orders');
  return data.orders ?? [];
}

export function useKitchenOrders() {
  const query = useQuery({
    queryKey: queryKeys.kitchenOrders,
    queryFn: fetchKitchenOrders,
    refetchInterval: pollingRefetchInterval(POLL_INTERVALS.kitchen),
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
