import { useEffect, type RefObject } from 'react';

export function useModalBodyLock(open: boolean): void {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}

export function usePreventNumberInputWheel(
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  useEffect(() => {
    if (!open || !containerRef.current) return;

    const container = containerRef.current;

    function onWheel(event: WheelEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'number') {
        event.preventDefault();
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [open, containerRef]);
}
