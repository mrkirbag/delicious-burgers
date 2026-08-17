import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type Client } from '@libsql/client';

async function columnExists(
  db: Client,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => String(row.name) === column);
}

async function tableExists(
  db: Client,
  table: string,
): Promise<boolean> {
  const result = await db.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  return result.rows.length > 0;
}

async function getTableSql(
  db: Client,
  table: string,
): Promise<string | null> {
  const result = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row?.sql ? String(row.sql) : null;
}

async function migratePaymentMethods(db: Client): Promise<void> {
  const paymentsSql = await getTableSql(db, 'order_payments');
  const ordersSql = await getTableSql(db, 'orders');
  const needsPaymentsMigration =
    paymentsSql?.includes("CHECK(payment_method IN ('efectivo', 'punto_de_venta'") ?? false;
  const needsOrdersMigration =
    ordersSql?.includes("CHECK(payment_method IN ('efectivo', 'punto_de_venta'") ?? false;

  if (!needsPaymentsMigration && !needsOrdersMigration) {
    return;
  }

  await db.execute('PRAGMA foreign_keys = OFF');

  if (needsPaymentsMigration && paymentsSql) {
    await db.execute(`
      CREATE TABLE order_payments_new (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount_cop REAL NOT NULL,
        foreign_currency TEXT,
        foreign_amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
      )
    `);
    await db.execute(`INSERT INTO order_payments_new SELECT * FROM order_payments`);
    await db.execute(`DROP TABLE order_payments`);
    await db.execute(`ALTER TABLE order_payments_new RENAME TO order_payments`);
    console.log('✓ order_payments payment methods');
  }

  if (needsOrdersMigration && ordersSql) {
    const hasDeliveryColumns = await columnExists(db, 'orders', 'order_type');

    await db.execute(`
      CREATE TABLE orders_new (
        id TEXT PRIMARY KEY,
        table_id TEXT,
        order_type TEXT NOT NULL DEFAULT 'mesa',
        user_id TEXT NOT NULL,
        cash_register_id TEXT,
        status TEXT CHECK(status IN ('pendiente', 'cocina', 'listo', 'entregado', 'pagado', 'cancelado')) DEFAULT 'pendiente',
        total REAL DEFAULT 0.0,
        payment_method TEXT,
        foreign_currency TEXT,
        foreign_amount REAL,
        customer_name TEXT,
        customer_phone TEXT,
        delivery_address TEXT,
        delivery_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(table_id) REFERENCES tables(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(cash_register_id) REFERENCES cash_registers(id)
      )
    `);

    if (hasDeliveryColumns) {
      await db.execute(`
        INSERT INTO orders_new (
          id, table_id, order_type, user_id, cash_register_id, status, total,
          payment_method, foreign_currency, foreign_amount,
          customer_name, customer_phone, delivery_address, delivery_notes,
          created_at, updated_at
        )
        SELECT
          id, table_id, order_type, user_id, cash_register_id, status, total,
          payment_method, foreign_currency, foreign_amount,
          customer_name, customer_phone, delivery_address, delivery_notes,
          created_at, updated_at
        FROM orders
      `);
    } else {
      await db.execute(`
        INSERT INTO orders_new (
          id, table_id, order_type, user_id, cash_register_id, status, total,
          payment_method, foreign_currency, foreign_amount,
          customer_name, customer_phone, delivery_address, delivery_notes,
          created_at, updated_at
        )
        SELECT
          id, table_id, 'mesa', user_id, cash_register_id, status, total,
          payment_method, foreign_currency, foreign_amount,
          NULL, NULL, NULL, NULL,
          created_at, updated_at
        FROM orders
      `);
    }

    await db.execute(`
      CREATE TABLE order_items_new (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT,
        price_at_sale REAL NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
      )
    `);
    await db.execute(`INSERT INTO order_items_new SELECT * FROM order_items`);

    await db.execute(`DROP TABLE order_items`);
    await db.execute(`DROP TABLE orders`);
    await db.execute(`ALTER TABLE orders_new RENAME TO orders`);
    await db.execute(`ALTER TABLE order_items_new RENAME TO order_items`);
    console.log('✓ orders payment methods');
  }

  await db.execute('PRAGMA foreign_keys = ON');
}

async function migrateDeliverySupport(db: Client): Promise<void> {
  if (!(await tableExists(db, 'orders'))) {
    return;
  }

  if (await columnExists(db, 'orders', 'order_type')) {
    return;
  }

  await db.execute('PRAGMA foreign_keys = OFF');

  await db.execute(`
    CREATE TABLE orders_new (
      id TEXT PRIMARY KEY,
      table_id TEXT,
      order_type TEXT NOT NULL DEFAULT 'mesa',
      user_id TEXT NOT NULL,
      cash_register_id TEXT,
      status TEXT CHECK(status IN ('pendiente', 'cocina', 'listo', 'entregado', 'pagado', 'cancelado')) DEFAULT 'pendiente',
      total REAL DEFAULT 0.0,
      payment_method TEXT,
      foreign_currency TEXT,
      foreign_amount REAL,
      customer_name TEXT,
      customer_phone TEXT,
      delivery_address TEXT,
      delivery_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(table_id) REFERENCES tables(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(cash_register_id) REFERENCES cash_registers(id)
    )
  `);

  await db.execute(`
    INSERT INTO orders_new (
      id, table_id, order_type, user_id, cash_register_id, status, total,
      payment_method, foreign_currency, foreign_amount,
      customer_name, customer_phone, delivery_address, delivery_notes,
      created_at, updated_at
    )
    SELECT
      id, table_id, 'mesa', user_id, cash_register_id, status, total,
      payment_method, foreign_currency, foreign_amount,
      NULL, NULL, NULL, NULL,
      created_at, updated_at
    FROM orders
  `);

  await db.execute(`
    CREATE TABLE order_items_new (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      price_at_sale REAL NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders_new(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);
  await db.execute(`INSERT INTO order_items_new SELECT * FROM order_items`);

  await db.execute(`DROP TABLE order_items`);
  await db.execute(`DROP TABLE orders`);
  await db.execute(`ALTER TABLE orders_new RENAME TO orders`);
  await db.execute(`ALTER TABLE order_items_new RENAME TO order_items`);

  await db.execute('PRAGMA foreign_keys = ON');
  console.log('✓ orders delivery support');
}

async function migrateDeliveryPaymentTiming(db: Client): Promise<void> {
  if (!(await tableExists(db, 'orders'))) {
    return;
  }

  if (await columnExists(db, 'orders', 'delivery_payment_timing')) {
    return;
  }

  await db.execute(
    `ALTER TABLE orders ADD COLUMN delivery_payment_timing TEXT CHECK(delivery_payment_timing IS NULL OR delivery_payment_timing IN ('on_delivery', 'prepaid'))`,
  );
  await db.execute(
    `UPDATE orders SET delivery_payment_timing = 'on_delivery' WHERE order_type = 'delivery'`,
  );
  console.log('✓ orders.delivery_payment_timing');
}

function parseSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

async function bootstrapSchema(db: Client): Promise<void> {
  if (await tableExists(db, 'users')) {
    return;
  }

  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'db.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  const statements = parseSqlStatements(sql);

  for (const statement of statements) {
    await db.execute(statement);
  }

  await db.execute(
    `INSERT INTO exchange_rates (id, usd_rate, bs_rate) VALUES ('default', 4000, 50)`,
  );

  console.log('✓ Esquema inicial creado desde db.sql');
}

function createDbFromEnv(): Client {
  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('Missing TURSO_URL or TURSO_AUTH_TOKEN in .env');
  }

  return createClient({ url, authToken });
}

export async function runMigrations(dbClient?: Client): Promise<void> {
  const db = dbClient ?? createDbFromEnv();

  await bootstrapSchema(db);

  if (!(await columnExists(db, 'users', 'active'))) {
    await db.execute('ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT TRUE');
    console.log('✓ users.active');
  }

  if (!(await columnExists(db, 'products', 'active'))) {
    await db.execute('ALTER TABLE products ADD COLUMN active BOOLEAN DEFAULT TRUE');
    console.log('✓ products.active');
  }

  if (await tableExists(db, 'inventory')) {
    if (!(await columnExists(db, 'inventory', 'unit'))) {
      await db.execute(`ALTER TABLE inventory ADD COLUMN unit TEXT NOT NULL DEFAULT 'unidades'`);
      console.log('✓ inventory.unit');
    }
  }

  if (!(await tableExists(db, 'exchange_rates'))) {
    await db.execute(`
      CREATE TABLE exchange_rates (
        id TEXT PRIMARY KEY DEFAULT 'default',
        usd_rate REAL NOT NULL,
        bs_rate REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT REFERENCES users(id)
      )
    `);
    await db.execute(
      `INSERT INTO exchange_rates (id, usd_rate, bs_rate) VALUES ('default', 4000, 50)`,
    );
    console.log('✓ exchange_rates');
  }

  if (!(await columnExists(db, 'orders', 'foreign_currency'))) {
    await db.execute(
      `ALTER TABLE orders ADD COLUMN foreign_currency TEXT CHECK(foreign_currency IS NULL OR foreign_currency IN ('usd', 'bs'))`,
    );
    console.log('✓ orders.foreign_currency');
  }

  if (!(await columnExists(db, 'orders', 'foreign_amount'))) {
    await db.execute(`ALTER TABLE orders ADD COLUMN foreign_amount REAL`);
    console.log('✓ orders.foreign_amount');
  }

  if (!(await columnExists(db, 'cash_registers', 'initial_balance_usd'))) {
    await db.execute(
      `ALTER TABLE cash_registers ADD COLUMN initial_balance_usd REAL NOT NULL DEFAULT 0`,
    );
    console.log('✓ cash_registers.initial_balance_usd');
  }

  if (!(await columnExists(db, 'cash_registers', 'final_balance_usd'))) {
    await db.execute(`ALTER TABLE cash_registers ADD COLUMN final_balance_usd REAL`);
    console.log('✓ cash_registers.final_balance_usd');
  }

  if (!(await columnExists(db, 'cash_registers', 'actual_balance_usd'))) {
    await db.execute(`ALTER TABLE cash_registers ADD COLUMN actual_balance_usd REAL`);
    console.log('✓ cash_registers.actual_balance_usd');
  }

  if (!(await tableExists(db, 'order_payments'))) {
    await db.execute(`
      CREATE TABLE order_payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount_cop REAL NOT NULL,
        foreign_currency TEXT CHECK(foreign_currency IS NULL OR foreign_currency IN ('usd', 'bs')),
        foreign_amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
      )
    `);
    console.log('✓ order_payments');

    await db.execute(`
      INSERT INTO order_payments (id, order_id, payment_method, amount_cop, foreign_currency, foreign_amount, created_at)
      SELECT
        'mig_' || o.id,
        o.id,
        o.payment_method,
        o.total,
        o.foreign_currency,
        o.foreign_amount,
        o.updated_at
      FROM orders o
      WHERE o.status = 'pagado'
        AND o.payment_method IS NOT NULL
    `);
    console.log('✓ order_payments backfill');
  }

  if (!(await tableExists(db, 'inventory_movements'))) {
    await db.execute(`
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
      )
    `);
    console.log('✓ inventory_movements');
  }

  await migrateDeliverySupport(db);
  await migrateDeliveryPaymentTiming(db);
  await migratePaymentMethods(db);

  if (await tableExists(db, 'order_items') && !(await columnExists(db, 'order_items', 'extras'))) {
    await db.execute('ALTER TABLE order_items ADD COLUMN extras TEXT');
    console.log('✓ order_items.extras');
  }

  if (!(await columnExists(db, 'products', 'inventory_product_id'))) {
    await db.execute(`ALTER TABLE products ADD COLUMN inventory_product_id TEXT REFERENCES products(id)`);
    console.log('✓ products.inventory_product_id');
  }

  if (!(await columnExists(db, 'products', 'inventory_units_per_sale'))) {
    await db.execute(
      `ALTER TABLE products ADD COLUMN inventory_units_per_sale INTEGER NOT NULL DEFAULT 1`,
    );
    console.log('✓ products.inventory_units_per_sale');
  }

  console.log('Migraciones completadas.');
}

const isDirectRun = process.argv[1]?.includes('migrate');

if (isDirectRun) {
  runMigrations().catch((error) => {
    console.error('Error al migrar:', error);
    process.exit(1);
  });
}
