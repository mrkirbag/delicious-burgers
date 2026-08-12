import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { OrderItemWithProduct } from '@/lib/db/orders';
import type { Order, OrderPayment, Product, TableStatus } from '@/lib/db/types';
import { queryKeys } from '@/lib/query/keys';

export type OrderDetail = {
  order: Order;
  items: OrderItemWithProduct[];
  payments: OrderPayment[];
  table: { id: string; number: string; capacity: number; status: TableStatus } | null;
};

async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  const data = await fetchJson<Partial<OrderDetail> & { order: Order; items: OrderItemWithProduct[] }>(
    `/api/orders/${orderId}`,
  );
  return {
    order: data.order,
    items: data.items,
    payments: data.payments ?? [],
    table: data.table ?? null,
  };
}

async function fetchMenuProducts(): Promise<Product[]> {
  const data = await fetchJson<{ products: Product[] }>('/api/menu/products');
  return data.products ?? [];
}

export function useOrderDetail(orderId: string) {
  const orderQuery = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: () => fetchOrderDetail(orderId),
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.menuProducts,
    queryFn: fetchMenuProducts,
    staleTime: 60_000,
  });

  return {
    data: orderQuery.data ?? null,
    products: productsQuery.data ?? [],
    isLoading: orderQuery.isLoading || productsQuery.isLoading,
    isFetching: orderQuery.isFetching,
    dataUpdatedAt: orderQuery.dataUpdatedAt,
    error: orderQuery.error ?? productsQuery.error,
    refetch: orderQuery.refetch,
  };
}
