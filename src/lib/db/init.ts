import { db } from './client';
import { runMigrations } from './migrate';

/** Subir este número al agregar migraciones para reaplicarlas en un proceso que ya tenía el esquema en memoria. */
const SCHEMA_GENERATION = 2;

let appliedGeneration = 0;
let schemaCheckPromise: Promise<void> | null = null;

async function checkAndMigrate(): Promise<void> {
  if (appliedGeneration >= SCHEMA_GENERATION) return;

  await runMigrations(db);
  appliedGeneration = SCHEMA_GENERATION;
}

export function ensureMigrations(): Promise<void> {
  if (appliedGeneration >= SCHEMA_GENERATION) {
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
  appliedGeneration = 0;
  schemaCheckPromise = null;
}
