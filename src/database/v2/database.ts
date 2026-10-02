import {open, type QueryResult, type QuickSQLiteConnection, type Transaction} from 'react-native-quick-sqlite';

import {V2_DATABASE_NAME} from './contracts';
import {V2_SCHEMA_STATEMENTS, V2_SCHEMA_VERSION} from './schema';

let connection: QuickSQLiteConnection | null = null;

export const nowIso = (): string => new Date().toISOString();

export const getV2Database = (): QuickSQLiteConnection => {
  if (!connection) {
    connection = open({name: V2_DATABASE_NAME});
  }

  return connection;
};

export const rowsToArray = <T>(result: QueryResult): T[] => {
  const rows: T[] = [];
  const source = result.rows;

  if (!source) {
    return rows;
  }

  for (let index = 0; index < source.length; index += 1) {
    rows.push(source.item(index) as T);
  }

  return rows;
};

export const withV2Transaction = async (
  callback: (transaction: Transaction) => void | Promise<void>,
): Promise<void> => {
  await getV2Database().transaction(callback);
};

export const initV2Database = async (): Promise<void> => {
  const database = getV2Database();

  database.execute('PRAGMA foreign_keys = ON');
  database.execute('PRAGMA journal_mode = WAL');

  await database.transaction(transaction => {
    V2_SCHEMA_STATEMENTS.forEach(statement => transaction.execute(statement));
    transaction.execute(
      `INSERT INTO schema_versions (schema_version_id, version_number, applied_at)
       VALUES (1, ?, ?)
       ON CONFLICT(schema_version_id) DO UPDATE SET
         version_number = excluded.version_number,
         applied_at = excluded.applied_at`,
      [V2_SCHEMA_VERSION, nowIso()],
    );
  });
};

export const closeV2Database = (): void => {
  connection?.close();
  connection = null;
};
