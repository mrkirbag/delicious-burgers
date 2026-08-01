import type { InArgs } from '@libsql/client';

export type SqlArgs = InArgs;

export type SqlStatement = {
  sql: string;
  args?: SqlArgs;
};
