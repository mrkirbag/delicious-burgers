import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { TableWithActiveOrder } from '@/lib/db/tables';
import { queryKeys } from '@/lib/query/keys';
import { POLL_INTERVALS, pollingRefetchInterval } from '@/lib/query/polling';

type TablesResponse = { tables: TableWithActiveOrder[] };

async function fetchTables(): Promise<TableWithActiveOrder[]> {
  const data = await fetchJson<TablesResponse>('/api/tables');
  return data.tables ?? [];
}

export function useTables() {
  const query = useQuery({
    queryKey: queryKeys.tables,
    queryFn: fetchTables,
    refetchInterval: pollingRefetchInterval(POLL_INTERVALS.operational),
  });

  return {
    tables: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error,
    refetch: query.refetch,
  };
}
