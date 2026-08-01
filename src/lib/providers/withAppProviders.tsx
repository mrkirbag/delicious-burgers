import type { ComponentType } from 'react';

import { AppProviders } from '@/components/providers/AppProviders';

export function withAppProviders<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function Wrapped(props: P) {
    return (
      <AppProviders>
        <Component {...props} />
      </AppProviders>
    );
  }

  Wrapped.displayName = `WithAppProviders(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Wrapped;
}
