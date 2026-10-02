import type { QueryResult, Transaction } from 'react-native-quick-sqlite';

import { v3RowsToArray } from './database';

export type V3SqlValue = string | number | null;
export type V3SqlRow = Record<string, V3SqlValue>;

export const v3Boolean = (value: boolean): number => (value ? 1 : 0);

export const assertV3SqlIdentifier = (identifier: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }

  return identifier;
};

export const upsertV3Row = (
  transaction: Transaction,
  tableName: string,
  row: V3SqlRow,
  conflictColumns: string[],
): void => {
  const table = assertV3SqlIdentifier(tableName);
  const columns = Object.keys(row).map(assertV3SqlIdentifier);
  const conflicts = conflictColumns.map(assertV3SqlIdentifier);
  const updateColumns = columns.filter(column => !conflicts.includes(column));
  const placeholders = columns.map(() => '?').join(', ');
  const updateSql = updateColumns.length
    ? `DO UPDATE SET ${updateColumns
        .map(column => `${column} = excluded.${column}`)
        .join(', ')}`
    : 'DO NOTHING';

  transaction.execute(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(${conflicts.join(', ')}) ${updateSql}`,
    columns.map(column => row[column]),
  );
};

export const insertV3Row = (
  transaction: Transaction,
  tableName: string,
  row: V3SqlRow,
): void => {
  const table = assertV3SqlIdentifier(tableName);
  const columns = Object.keys(row).map(assertV3SqlIdentifier);

  transaction.execute(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map(column => row[column]),
  );
};

export const firstV3Row = <T>(result: QueryResult): T | null =>
  v3RowsToArray<T>(result)[0] ?? null;
