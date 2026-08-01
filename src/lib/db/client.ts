import { createClient, type Client } from '@libsql/client';

import { env } from '@/lib/config/env';

let client: Client | null = null;

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: env.tursoUrl,
      authToken: env.tursoAuthToken,
    });
  }

  return client;
}

/** Solo para tests: reinicia el cliente singleton. */
export function resetDbClient(): void {
  if (client) {
    void client.close();
    client = null;
  }
}

export const db: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const current = getDb();
    const value = current[prop as keyof Client];
    return typeof value === 'function' ? value.bind(current) : value;
  },
});
