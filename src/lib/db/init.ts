import { db } from './client';
import { runMigrations } from './migrate';

let schemaReady = false;
let schemaCheckPromise: Promise<void> | null = null;

async function checkAndMigrate(): Promise<void> {
  if (schemaReady) return;

  await runMigrations(db);
  schemaReady = true;
}

export function ensureMigrations(): Promise<void> {
  if (schemaReady) {
    return Promise.resolve();
  }

  if (!schemaCheckPromise) {
    schemaCheckPromise = checkAndMigrate().catch((error) => {
      schemaCheckPromise = null;
      console.error('Error al verificar migraciones:', error);
      throw error;
    });
  }

  return schemaCheckPromise;
}

/** Solo para tests: permite volver a ejecutar migraciones. */
export function resetSchemaState(): void {
  schemaReady = false;
  schemaCheckPromise = null;
}
