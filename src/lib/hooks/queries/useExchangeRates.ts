import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { ExchangeRates } from '@/lib/db/types';
import { queryKeys } from '@/lib/query/keys';
import { POLL_INTERVALS, pollingRefetchInterval } from '@/lib/query/polling';

type ExchangeRatesResponse = { rates: ExchangeRates };

async function fetchExchangeRates(): Promise<ExchangeRates> {
  const data = await fetchJson<ExchangeRatesResponse>('/api/exchange-rates');
  return data.rates;
}

export function useExchangeRates() {
  const query = useQuery({
    queryKey: queryKeys.exchangeRates,
    queryFn: fetchExchangeRates,
    refetchInterval: pollingRefetchInterval(POLL_INTERVALS.operational),
  });

  return {
    rates: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error,
    refetch: query.refetch,
  };
}
