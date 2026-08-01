import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { CatalogProduct } from '@/lib/db/products';
import { queryKeys } from '@/lib/query/keys';

async function fetchProducts(): Promise<CatalogProduct[]> {
  const data = await fetchJson<{ products: CatalogProduct[] }>('/api/products');
  return data.products ?? [];
}

export function useProducts() {
  const query = useQuery({
    queryKey: queryKeys.products,
    queryFn: fetchProducts,
  });

  return {
    products: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
