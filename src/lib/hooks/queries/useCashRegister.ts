import { useQuery } from '@tanstack/react-query';

import { parseError } from '@/lib/api/parseError';
import type { CashRegisterSummary } from '@/lib/db/cash-registers';
import type { OrderListItem } from '@/lib/db/orders';
import type { ExchangeRates } from '@/lib/db/types';
import { queryKeys } from '@/lib/query/keys';
import { POLL_INTERVALS, pollingRefetchInterval } from '@/lib/query/polling';

export type CashRegisterData = {
  register: CashRegisterSummary | null;
  pendingOrders: OrderListItem[];
  exchangeRates: ExchangeRates | null;
};

async function fetchCashRegisterData(): Promise<CashRegisterData> {
  const [registerRes, ordersRes, ratesRes] = await Promise.all([
    fetch('/api/cash-registers'),
    fetch('/api/orders?pending_payment=1'),
    fetch('/api/exchange-rates'),
  ]);

  if (!registerRes.ok) throw new Error(await parseError(registerRes));
  if (!ordersRes.ok) throw new Error(await parseError(ordersRes));

  const registerData = await registerRes.json();
  const ordersData = await ordersRes.json();

  let exchangeRates: ExchangeRates | null = null;
  if (ratesRes.ok) {
    const ratesData = await ratesRes.json();
    exchangeRates = ratesData.rates ?? null;
  }

  return {
    register: registerData.register ?? null,
    pendingOrders: ordersData.orders ?? [],
    exchangeRates,
  };
}

export function useCashRegister() {
  const query = useQuery({
    queryKey: queryKeys.cashRegister,
    queryFn: fetchCashRegisterData,
    refetchInterval: pollingRefetchInterval(POLL_INTERVALS.operational),
  });

  return {
    data: query.data ?? null,
    register: query.data?.register ?? null,
    pendingOrders: query.data?.pendingOrders ?? [],
    exchangeRates: query.data?.exchangeRates ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error,
    refetch: query.refetch,
  };
}
