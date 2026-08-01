import type { ExchangeRates } from '@/lib/db/types';
import {
  convertCopToBs,
  convertCopToUsd,
  formatBs,
  formatCop,
  formatUsd,
} from '@/lib/utils/currency';

import './MultiCurrencyPrice.css';

type MultiCurrencyPriceProps = {
  amountCop: number;
  rates: ExchangeRates | null;
  variant?: 'default' | 'total' | 'inline';
  align?: 'left' | 'right';
  className?: string;
};

export default function MultiCurrencyPrice({
  amountCop,
  rates,
  variant = 'default',
  align = 'left',
  className = '',
}: MultiCurrencyPriceProps) {
  const classes = [
    'multi-price',
    `multi-price--${variant}`,
    `multi-price--${align}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      <span className="multi-price__cop">{formatCop(amountCop)}</span>
      {rates && rates.usd_rate > 0 && rates.bs_rate > 0 && (
        <span className="multi-price__foreign">
          <span>{formatUsd(convertCopToUsd(amountCop, rates))}</span>
          <span className="multi-price__sep" aria-hidden="true">
            ·
          </span>
          <span>{formatBs(convertCopToBs(amountCop, rates))}</span>
        </span>
      )}
    </span>
  );
}
