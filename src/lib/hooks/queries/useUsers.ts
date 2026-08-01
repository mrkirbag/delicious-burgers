import { useQuery } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/parseError';
import type { PublicUser } from '@/lib/db/users';
import { queryKeys } from '@/lib/query/keys';

async function fetchUsers(): Promise<PublicUser[]> {
  const data = await fetchJson<{ users: PublicUser[] }>('/api/users');
  return data.users ?? [];
}

export function useUsers() {
  const query = useQuery({
    queryKey: queryKeys.users,
    queryFn: fetchUsers,
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
