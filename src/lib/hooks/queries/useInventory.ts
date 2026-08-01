import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { InventoryItem } from '@/lib/db/inventory';
import { queryKeys } from '@/lib/query/keys';

async function fetchInventory(): Promise<InventoryItem[]> {
  const data = await fetchJson<{ items: InventoryItem[] }>('/api/inventory');
  return data.items ?? [];
}

export function useInventory() {
  const query = useQuery({
    queryKey: queryKeys.inventory,
    queryFn: fetchInventory,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export type InventoryMovementRecord = {
  id: string;
  type: 'entrada' | 'salida';
  quantity: number;
  reason: string | null;
  username: string;
  created_at: string;
};

export function useInventoryMovements(itemId: string | null) {
  const query = useQuery({
    queryKey: [...queryKeys.inventory, 'movements', itemId] as const,
    queryFn: async () => {
      const data = await fetchJson<{ movements: InventoryMovementRecord[] }>(
        `/api/inventory/${itemId}/movements`,
      );
      return data.movements ?? [];
    },
    enabled: Boolean(itemId),
  });

  return {
    movements: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
