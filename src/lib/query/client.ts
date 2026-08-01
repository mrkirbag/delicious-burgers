import { QueryClient } from '@tanstack/react-query';

const isBrowser = typeof window !== 'undefined';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      refetchOnWindowFocus: isBrowser,
    },
  },
});
