import { createId } from '@/lib/utils/id';

import { db } from './client';
import type { SqlArgs } from './sql';
import type { Table, TableStatus } from './types';

export type TableWithActiveOrder = Table & {
  active_order_id: string | null;
};

const ACTIVE_ORDER_STATUSES = ['pendiente', 'cocina', 'listo', 'entregado'] as const;

function mapTable(row: Record<string, unknown>): TableWithActiveOrder {
  return {
    id: String(row.id),
    number: String(row.number),
    capacity: Number(row.capacity),
    status: row.status as TableStatus,
    active_order_id: row.active_order_id ? String(row.active_order_id) : null,
  };
}

const LIST_TABLES_SQL = `
  SELECT
    t.id,
    t.number,
    t.capacity,
    t.status,
    (
      SELECT o.id
      FROM orders o
      WHERE o.table_id = t.id
        AND o.status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(', ')})
      ORDER BY o.created_at DESC
      LIMIT 1
    ) AS active_order_id
  FROM tables t
  ORDER BY CAST(t.number AS INTEGER), t.number ASC
`;

export async function listTables(): Promise<TableWithActiveOrder[]> {
  const result = await db.execute({
    sql: LIST_TABLES_SQL,
    args: [...ACTIVE_ORDER_STATUSES],
  });

  return result.rows.map((row) => mapTable(row as Record<string, unknown>));
}

export async function getTableById(id: string): Promise<TableWithActiveOrder | null> {
  const result = await db.execute({
    sql: `
      SELECT
        t.id,
        t.number,
        t.capacity,
        t.status,
        (
          SELECT o.id
          FROM orders o
          WHERE o.table_id = t.id
            AND o.status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(', ')})
          ORDER BY o.created_at DESC
          LIMIT 1
        ) AS active_order_id
      FROM tables t
      WHERE t.id = ?
      LIMIT 1
    `,
    args: [...ACTIVE_ORDER_STATUSES, id],
  });

  if (result.rows.length === 0) return null;
  return mapTable(result.rows[0] as Record<string, unknown>);
}

export async function getTableByNumber(number: string): Promise<Table | null> {
  const result = await db.execute({
    sql: 'SELECT id, number, capacity, status FROM tables WHERE number = ? LIMIT 1',
    args: [number],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    number: String(row.number),
    capacity: Number(row.capacity),
    status: row.status as TableStatus,
  };
}

type CreateTableInput = {
  number: string;
  capacity: number;
};

export async function createTable(input: CreateTableInput): Promise<Table> {
  const id = createId();

  await db.execute({
    sql: `
      INSERT INTO tables (id, number, capacity, status)
      VALUES (?, ?, ?, 'libre')
    `,
    args: [id, input.number, input.capacity],
  });

  const table = await getTableById(id);
  if (!table) throw new Error('No se pudo crear la mesa');
  return table;
}

type UpdateTableInput = {
  number?: string;
  capacity?: number;
  status?: TableStatus;
};

export async function updateTable(
  id: string,
  input: UpdateTableInput,
): Promise<TableWithActiveOrder | null> {
  const fields: string[] = [];
  const args: SqlArgs = [];

  if (input.number !== undefined) {
    fields.push('number = ?');
    args.push(input.number);
  }

  if (input.capacity !== undefined) {
    fields.push('capacity = ?');
    args.push(input.capacity);
  }

  if (input.status !== undefined) {
    fields.push('status = ?');
    args.push(input.status);
  }

  if (fields.length === 0) {
    return getTableById(id);
  }

  await db.execute({
    sql: `UPDATE tables SET ${fields.join(', ')} WHERE id = ?`,
    args: [...args, id],
  });

  return getTableById(id);
}

export async function countActiveOrdersForTable(tableId: string): Promise<number> {
  const result = await db.execute({
    sql: `
      SELECT COUNT(*) AS count
      FROM orders
      WHERE table_id = ?
        AND status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(', ')})
    `,
    args: [tableId, ...ACTIVE_ORDER_STATUSES],
  });

  return Number(result.rows[0].count);
}

export async function deleteTable(id: string): Promise<boolean> {
  const result = await db.execute({
    sql: 'DELETE FROM tables WHERE id = ?',
    args: [id],
  });

  return result.rowsAffected > 0;
}

export const TABLE_STATUSES: TableStatus[] = ['libre', 'ocupada', 'limpieza'];

export function isValidTableStatus(value: string): value is TableStatus {
  return TABLE_STATUSES.includes(value as TableStatus);
}
