import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { SalesReport } from '@/lib/db/reports';
import { queryKeys } from '@/lib/query/keys';

export type ReportFilters = {
  dateFrom: string;
  dateTo: string;
};

async function fetchSalesReport(filters: ReportFilters): Promise<SalesReport> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);

  const data = await fetchJson<{ report: SalesReport }>(`/api/reports/sales?${params.toString()}`);
  return data.report;
}

export function useSalesReport(filters: ReportFilters) {
  const query = useQuery({
    queryKey: [...queryKeys.reports, filters] as const,
    queryFn: () => fetchSalesReport(filters),
  });

  return {
    report: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
