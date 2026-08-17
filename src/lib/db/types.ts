export type UserRole = 'admin' | 'cajero' | 'mesero' | 'cocina';

export type User = {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  active: boolean;
};

export type TableStatus = 'libre' | 'ocupada' | 'limpieza';

export type Table = {
  id: string;
  number: string;
  capacity: number;
  status: TableStatus;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  requires_inventory: boolean;
  active: boolean;
  inventory_product_id?: string | null;
  inventory_units_per_sale?: number;
};

export type Inventory = {
  product_id: string;
  stock: number;
  min_stock: number;
  unit: string;
};

export type InventoryMovementType = 'entrada' | 'salida';

export type InventoryMovement = {
  id: string;
  product_id: string;
  type: InventoryMovementType;
  quantity: number;
  reason: string | null;
  user_id: string;
  created_at: string;
};

export type CashRegisterStatus = 'open' | 'closed';

export type CashRegister = {
  id: string;
  opened_by: string;
  closed_by: string | null;
  initial_balance: number;
  initial_balance_usd: number;
  final_balance: number | null;
  final_balance_usd: number | null;
  actual_balance: number | null;
  actual_balance_usd: number | null;
  opened_at: string;
  closed_at: string | null;
  status: CashRegisterStatus;
};

export type OrderStatus =
  | 'pendiente'
  | 'cocina'
  | 'listo'
  | 'entregado'
  | 'pagado'
  | 'cancelado';

export type PaymentMethod =
  | 'efectivo'
  | 'nequi'
  | 'bancolombia'
  | 'punto_de_venta'
  | 'pago_movil'
  | 'usd_efectivo'
  | 'zelle'
  | 'binance_usdt'
  | 'divisas';

export type ForeignCurrency = 'usd' | 'bs';

export type ExchangeRates = {
  id: string;
  usd_rate: number;
  bs_rate: number;
  updated_at: string;
  updated_by: string | null;
};

export type OrderType = 'mesa' | 'delivery';

export type DeliveryPaymentTiming = 'on_delivery' | 'prepaid';

export type Order = {
  id: string;
  table_id: string | null;
  order_type: OrderType;
  delivery_payment_timing: DeliveryPaymentTiming | null;
  user_id: string;
  cash_register_id: string | null;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod | null;
  foreign_currency: ForeignCurrency | null;
  foreign_amount: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItemExtra = {
  product_id: string;
  name: string;
  price: number;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  extras: OrderItemExtra[];
  price_at_sale: number;
};

export type OrderPayment = {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount_cop: number;
  foreign_currency: ForeignCurrency | null;
  foreign_amount: number | null;
  created_at: string;
};

export type OrderPaymentInput = {
  payment_method: PaymentMethod;
  amount_cop: number;
  foreign_currency?: ForeignCurrency | null;
  foreign_amount?: number | null;
};
