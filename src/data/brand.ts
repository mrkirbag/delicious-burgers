export type BrandColors = {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
};

export type BrandAssets = {
  logo: string;
  logoMark: string;
  favicon: string;
  loginBackground?: string;
};

export type BrandContact = {
  phone?: string;
  instagram?: string;
  address?: string;
  city?: string;
  country?: string;
};

export type BrandCurrency = {
  code: string;
  symbol: string;
  locale: string;
};

export type BrandTicket = {
  footer: string;
};

export type BrandDelivery = {
  readyWhatsAppMessage: string;
};

export type BrandConfig = {
  name: string;
  shortName: string;
  tagline: string;
  locale: string;
  currency: BrandCurrency;
  assets: BrandAssets;
  colors: BrandColors;
  contact: BrandContact;
  ticket: BrandTicket;
  delivery: BrandDelivery;
};

/**
 * Configuración white-label del cliente.
 * Para revender: cambia este archivo y el .env, sin tocar el diseño del sistema.
 *
 * Assets en public/brand/ (logo.webp, favicon.webp, etc.)
 */
export const brand = {
  name: 'Delicious Burger',
  shortName: 'DB',
  tagline: 'Las mejores hamburguesas de la ciudad',
  locale: 'es',

  currency: {
    code: 'COP',
    symbol: '$',
    locale: 'es-CO',
  },

  assets: {
    logo: '/brand/logo.webp',
    logoMark: '/brand/favicon.webp',
    favicon: '/brand/favicon.webp',
  },

  colors: {
    primary: '#E85D04',
    primaryForeground: '#FFFFFF',
    secondary: '#1A1A2E',
    secondaryForeground: '#FFFFFF',
    accent: '#FAA307',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    text: '#1A1A2E',
    textMuted: '#6C757D',
    border: '#DEE2E6',
    success: '#2D6A4F',
    warning: '#E9C46A',
    error: '#D00000',
  },

  contact: {
    phone: '+58 424-7580992',
    instagram: '@delicious_burgers.sc',
    address: 'La Concordia',
    city: 'San Cristóbal',
    country: 'Venezuela',
  },

  ticket: {
    footer: '¡Gracias por su preferencia!',
  },

  delivery: {
    readyWhatsAppMessage:
      'Hola {customer_name}, tu pedido en {brand_name} ya está listo y será enviado en breve. ¡Gracias por tu preferencia!',
  },
} as const satisfies BrandConfig;

export function brandCssVariables(): Record<string, string> {
  return {
    '--color-primary': brand.colors.primary,
    '--color-primary-foreground': brand.colors.primaryForeground,
    '--color-secondary': brand.colors.secondary,
    '--color-secondary-foreground': brand.colors.secondaryForeground,
    '--color-accent': brand.colors.accent,
    '--color-background': brand.colors.background,
    '--color-surface': brand.colors.surface,
    '--color-text': brand.colors.text,
    '--color-text-muted': brand.colors.textMuted,
    '--color-border': brand.colors.border,
    '--color-success': brand.colors.success,
    '--color-warning': brand.colors.warning,
    '--color-error': brand.colors.error,
  };
}

export function brandCssVariablesStyle(): string {
  return `:root { ${Object.entries(brandCssVariables())
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')}; }`;
}
