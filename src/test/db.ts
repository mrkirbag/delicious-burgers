import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, type Client } from '@libsql/client';
import bcrypt from 'bcryptjs';

import { resetDbClient } from '@/lib/db/client';
import { resetSchemaState } from '@/lib/db/init';
import { runMigrations } from '@/lib/db/migrate';
import { createId } from '@/lib/utils/id';

let tempDir: string | null = null;

export async function setupTestDatabase(): Promise<void> {
  tempDir = mkdtempSync(join(tmpdir(), 'delicious-burger-test-'));
  process.env.TURSO_URL = `file:${join(tempDir, 'test.db')}`;
  process.env.TURSO_AUTH_TOKEN = '';
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';

  resetDbClient();
  resetSchemaState();

  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: '',
  });

  await runMigrations(client);
  resetDbClient();
}

export function teardownTestDatabase(): void {
  resetDbClient();
  resetSchemaState();

  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows puede mantener el archivo sqlite abierto brevemente.
    }
    tempDir = null;
  }
}

export async function createTestUser(
  client: Client,
  username: string,
  password: string,
  role: 'admin' | 'cajero' | 'mesero' | 'cocina' = 'admin',
): Promise<string> {
  const id = createId();
  const passwordHash = await bcrypt.hash(password, 4);

  await client.execute({
    sql: `
      INSERT INTO users (id, username, password_hash, role, active)
      VALUES (?, ?, ?, ?, 1)
    `,
    args: [id, username, passwordHash, role],
  });

  return id;
}
