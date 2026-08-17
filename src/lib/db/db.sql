-- Usuarios y Roles
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'cajero', 'mesero', 'cocina')) NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- Mesas
CREATE TABLE tables (
    id TEXT PRIMARY KEY,
    number TEXT UNIQUE NOT NULL,
    capacity INTEGER NOT NULL,
    status TEXT CHECK(status IN ('libre', 'ocupada', 'limpieza')) DEFAULT 'libre'
);

-- Catálogo de Comida y Bebidas
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    requires_inventory BOOLEAN DEFAULT FALSE,
    inventory_product_id TEXT REFERENCES products(id),
    inventory_units_per_sale INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN DEFAULT TRUE
);

-- Inventario (insumos: cajas de refresco, bolsas de pan, etc.)
CREATE TABLE inventory (
    product_id TEXT PRIMARY KEY,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    unit TEXT NOT NULL DEFAULT 'unidades',
    FOREIGN KEY(product_id) REFERENCES products(id)
);

-- Movimientos manuales de inventario (entradas y salidas)
CREATE TABLE inventory_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    type TEXT CHECK(type IN ('entrada', 'salida')) NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Sesiones de Caja (Flujo de Dinero)
CREATE TABLE cash_registers (
    id TEXT PRIMARY KEY,
    opened_by TEXT NOT NULL,
    closed_by TEXT,
    initial_balance REAL NOT NULL,
    initial_balance_usd REAL NOT NULL DEFAULT 0,
    final_balance REAL,
    final_balance_usd REAL,
    actual_balance REAL, -- Lo que el cajero cuenta físicamente al cerrar (COP)
    actual_balance_usd REAL, -- Lo que el cajero cuenta físicamente al cerrar (USD)
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
    FOREIGN KEY(opened_by) REFERENCES users(id)
);

-- Comandas / Pedidos Principales
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    table_id TEXT,
    order_type TEXT NOT NULL DEFAULT 'mesa' CHECK(order_type IN ('mesa', 'delivery')),
    user_id TEXT NOT NULL,
    cash_register_id TEXT,
    status TEXT CHECK(status IN ('pendiente', 'cocina', 'listo', 'entregado', 'pagado', 'cancelado')) DEFAULT 'pendiente',
    total REAL DEFAULT 0.0,
    payment_method TEXT CHECK(payment_method IN ('efectivo', 'nequi', 'bancolombia', 'punto_de_venta', 'pago_movil', 'usd_efectivo', 'zelle', 'binance_usdt', 'divisas')),
    foreign_currency TEXT CHECK(foreign_currency IS NULL OR foreign_currency IN ('usd', 'bs')),
    foreign_amount REAL,
    delivery_payment_timing TEXT CHECK(delivery_payment_timing IS NULL OR delivery_payment_timing IN ('on_delivery', 'prepaid')),
    customer_name TEXT,
    customer_phone TEXT,
    delivery_address TEXT,
    delivery_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(table_id) REFERENCES tables(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(cash_register_id) REFERENCES cash_registers(id)
);

-- Pagos de comanda (cobro dividido)
CREATE TABLE order_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    payment_method TEXT CHECK(payment_method IN ('efectivo', 'nequi', 'bancolombia', 'punto_de_venta', 'pago_movil', 'usd_efectivo', 'zelle', 'binance_usdt', 'divisas')) NOT NULL,
    amount_cop REAL NOT NULL,
    foreign_currency TEXT CHECK(foreign_currency IS NULL OR foreign_currency IN ('usd', 'bs')),
    foreign_amount REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id)
);

-- Tasas de cambio (COP por unidad de moneda extranjera)
CREATE TABLE exchange_rates (
    id TEXT PRIMARY KEY DEFAULT 'default',
    usd_rate REAL NOT NULL,
    bs_rate REAL NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT REFERENCES users(id)
);

-- Detalle del Pedido
CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT, -- "Sin cebolla", "Bien cocido", etc.
    extras TEXT, -- JSON: adicionales ligados al producto [{product_id, name, price}]
    price_at_sale REAL NOT NULL, -- Precio unitario (producto + adicionales)
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
);