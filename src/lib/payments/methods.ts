import type { ForeignCurrency, PaymentMethod } from '@/lib/db/types';

/** Métodos activos en el modal de cobro. */
export const ACTIVE_PAYMENT_METHODS = [
  'efectivo',
  'nequi',
  'bancolombia',
  'punto_de_venta',
  'pago_movil',
  'usd_efectivo',
  'zelle',
  'binance_usdt',
] as const;

export type ActivePaymentMethod = (typeof ACTIVE_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo (COP)',
  nequi: 'Nequi',
  bancolombia: 'Bancolombia',
  punto_de_venta: 'Punto de venta (BS)',
  pago_movil: 'Pago móvil (BS)',
  usd_efectivo: 'Efectivo USD',
  zelle: 'Zelle',
  binance_usdt: 'Binance USDT',
  divisas: 'Divisas',
};

export const PAYMENT_OPTION_GROUPS: {
  label: string;
  methods: ActivePaymentMethod[];
}[] = [
  {
    label: 'Pesos (COP)',
    methods: ['efectivo', 'nequi', 'bancolombia'],
  },
  {
    label: 'Bolívares (BS)',
    methods: ['punto_de_venta', 'pago_movil'],
  },
  {
    label: 'Dólares (USD)',
    methods: ['usd_efectivo', 'zelle', 'binance_usdt'],
  },
];

export const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  ...ACTIVE_PAYMENT_METHODS,
  'divisas',
];

export function isValidPaymentMethod(value: string): value is PaymentMethod {
  return ALL_PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function isCashPaymentMethod(method: PaymentMethod): boolean {
  return method === 'efectivo' || method === 'usd_efectivo';
}

export function isUsdPaymentMethod(method: PaymentMethod): boolean {
  return method === 'usd_efectivo' || method === 'zelle' || method === 'binance_usdt';
}

export function isBsPaymentMethod(method: PaymentMethod): boolean {
  return method === 'punto_de_venta' || method === 'pago_movil';
}

export function isCopPaymentMethod(method: PaymentMethod): boolean {
  return method === 'efectivo' || method === 'nequi' || method === 'bancolombia';
}

export function requiresForeignAmount(method: PaymentMethod): boolean {
  return isUsdPaymentMethod(method) || isBsPaymentMethod(method) || method === 'divisas';
}

export function getPaymentLabel(
  method: PaymentMethod | null,
  foreignCurrency?: ForeignCurrency | null,
): string {
  if (!method) return '—';

  if (method === 'divisas') {
    if (foreignCurrency === 'usd') return 'Dólares (USD)';
    if (foreignCurrency === 'bs') return 'Bolívares (BS)';
  }

  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export function getPaymentAmountUnit(method: PaymentMethod): 'COP' | 'USD' | 'BS' {
  if (isUsdPaymentMethod(method) || method === 'divisas') return 'USD';
  if (isBsPaymentMethod(method)) return 'BS';
  return 'COP';
}
