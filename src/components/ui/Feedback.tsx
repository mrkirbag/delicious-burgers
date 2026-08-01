import '@/components/ui/ui.css';

import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertProps = {
  variant?: 'error' | 'success' | 'info';
  children: ReactNode;
  className?: string;
};

export function Alert({ variant = 'error', children, className = '' }: AlertProps) {
  return (
    <div className={`ui-alert ui-alert--${variant} ${className}`.trim()} role="alert">
      {children}
    </div>
  );
}

type SpinnerProps = {
  label?: string;
  className?: string;
};

export function Spinner({ label = 'Cargando…', className = '' }: SpinnerProps) {
  return (
    <div className={`ui-spinner ${className}`.trim()}>
      <Loader2 className="ui-spin" size={20} />
      {label}
    </div>
  );
}

type EmptyStateProps = {
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, children, actions, className = '' }: EmptyStateProps) {
  return (
    <div className={`ui-empty ${className}`.trim()}>
      {icon && <div className="ui-empty__icon">{icon}</div>}
      {title && <p className="ui-empty__title">{title}</p>}
      {children && <div className="ui-empty__body">{children}</div>}
      {actions && <div className="ui-empty__actions">{actions}</div>}
    </div>
  );
}

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`ui-skeleton ${className}`.trim()} aria-hidden="true" />;
}

type SkeletonGridProps = {
  count?: number;
  className?: string;
};

export function SkeletonGrid({ count = 6, className = '' }: SkeletonGridProps) {
  return (
    <div className={`ui-skeleton-grid ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="ui-skeleton ui-skeleton-card" />
      ))}
    </div>
  );
}

type SkeletonTableProps = {
  rows?: number;
  className?: string;
};

export function SkeletonTable({ rows = 6, className = '' }: SkeletonTableProps) {
  return (
    <div className={`ui-skeleton-table ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ui-skeleton ui-skeleton-row" />
      ))}
    </div>
  );
}
