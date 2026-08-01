import 'dotenv/config';

import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

import { runMigrations } from '@/lib/db/migrate';
import { createId } from '@/lib/utils/id';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '12345678';
const ADMIN_ROLE = 'admin';

const DEFAULT_TABLES = [
  { number: '1', capacity: 4 },
  { number: '2', capacity: 4 },
  { number: '3', capacity: 4 },
  { number: '4', capacity: 2 },
  { number: '5', capacity: 2 },
  { number: '6', capacity: 6 },
  { number: '7', capacity: 6 },
  { number: '8', capacity: 8 },
];

async function seedTables(db: ReturnType<typeof createClient>) {
  const existing = await db.execute('SELECT COUNT(*) AS count FROM tables');

  if (Number(existing.rows[0].count) > 0) {
    console.log('Mesas ya existen. Seed de mesas omitido.');
    return;
  }

  for (const table of DEFAULT_TABLES) {
    await db.execute({
      sql: `
        INSERT INTO tables (id, number, capacity, status)
        VALUES (?, ?, ?, 'libre')
      `,
      args: [createId(), table.number, table.capacity],
    });
  }

  console.log(`${DEFAULT_TABLES.length} mesas creadas correctamente.`);
}

async function seedAdmin() {
  await runMigrations();

  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('Missing TURSO_URL or TURSO_AUTH_TOKEN in .env');
  }

  const db = createClient({ url, authToken });

  await seedTables(db);

  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [ADMIN_USERNAME],
  });

  if (existing.rows.length > 0) {
    console.log(`Usuario "${ADMIN_USERNAME}" ya existe. Seed omitido.`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await db.execute({
    sql: `
      INSERT INTO users (id, username, password_hash, role, active)
      VALUES (?, ?, ?, ?, ?)
    `,
    args: [createId(), ADMIN_USERNAME, passwordHash, ADMIN_ROLE, true],
  });

  console.log(`Usuario administrador "${ADMIN_USERNAME}" creado correctamente.`);
}

seedAdmin().catch((error) => {
  console.error('Error al ejecutar seed:', error);
  process.exit(1);
});
