export const POLL_INTERVALS = {
  kitchen: 10_000,
  operational: 15_000,
} as const;

export function pollingRefetchInterval(ms: number) {
  return () => {
    if (typeof document === 'undefined') return false;
    return document.hidden ? false : ms;
  };
}
