import {
  open,
  type QueryResult,
  type QuickSQLiteConnection,
  type Transaction,
} from 'react-native-quick-sqlite';

import {
  V3_DRAFT_DATABASE_NAME,
  V3_DRAFT_SCHEMA_STATEMENTS,
  V3_DRAFT_SCHEMA_VERSION,
} from './schema';
import {createV2Uuid} from '../v2/uuid';

let connection: QuickSQLiteConnection | null = null;

export const v3NowIso = (): string => new Date().toISOString();

export const getV3Database = (): QuickSQLiteConnection => {
  if (!connection) {
    connection = open({ name: V3_DRAFT_DATABASE_NAME });
  }

  return connection;
};

export const v3RowsToArray = <T>(result: QueryResult): T[] => {
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

export const withV3Transaction = async (
  callback: (transaction: Transaction) => void | Promise<void>,
): Promise<void> => {
  await getV3Database().transaction(callback);
};

/**
 * CREATE TABLE IF NOT EXISTS never touches a table that already exists on a
 * device, so a schema.ts column addition alone is invisible to installs that
 * created the table before it was added. This patches an already-created
 * table onto the current schema, mirroring the equivalent pattern already
 * used for the V1/V2 database. Any pre-existing row is backfilled with a
 * freshly generated, per-row-unique value rather than left null, since these
 * columns hold idempotency-key UUIDs that must be stable but distinct.
 */
const patchDynamicObjectiveOutboxWrittenVerificationUuids = (transaction: Transaction): void => {
  const table = 'dynamic_objective_outbox';
  const columns = v3RowsToArray<{name: string}>(transaction.execute(`PRAGMA table_info(${table})`));
  if (!columns.some(column => column.name === 'written_verification_sync_uuid')) {
    transaction.execute(`ALTER TABLE ${table} ADD COLUMN written_verification_sync_uuid TEXT`);
    transaction.execute(`ALTER TABLE ${table} ADD COLUMN written_verification_operation_uuid TEXT`);
  }
  const unpatchedRows = v3RowsToArray<{dynamic_objective_outbox_id: number}>(transaction.execute(
    `SELECT dynamic_objective_outbox_id FROM ${table} WHERE written_verification_sync_uuid IS NULL`,
  ));
  unpatchedRows.forEach(row => {
    transaction.execute(
      `UPDATE ${table}
          SET written_verification_sync_uuid = ?, written_verification_operation_uuid = ?
        WHERE dynamic_objective_outbox_id = ?`,
      [createV2Uuid(), createV2Uuid(), row.dynamic_objective_outbox_id],
    );
  });
};

const TESTS_CHILD_TABLES = ['test_assignments', 'test_parts'] as const;

const countTestsLinkViolations = (execute: (sql: string) => QueryResult): number =>
  TESTS_CHILD_TABLES.reduce(
    (total, table) => total + v3RowsToArray(execute(`PRAGMA foreign_key_check(${table})`)).length,
    0,
  );

/**
 * Installs created before schema version 5 required tests.total_items >= 5.
 * The backend has no such minimum (only answer sheets need 5 questions), so a
 * 4-item quiz failed that CHECK and - because a download is saved in one
 * transaction - blocked that teacher's whole download. SQLite can't change a
 * CHECK in place, so this follows SQLite's documented table-rebuild procedure
 * (foreign keys off; create, copy, drop, rename; verify links), using the
 * current schema.ts definition. Runs once: afterwards the old CHECK is gone.
 */
const testsTableNeedsRebuild = (execute: (sql: string) => QueryResult): boolean => {
  const existing = v3RowsToArray<{sql: string}>(execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tests'",
  ))[0];
  return Boolean(existing && /total_items\s*>=\s*5/.test(existing.sql));
};

const rebuildTestsTableWithoutItemMinimum = async (database: QuickSQLiteConnection): Promise<void> => {
  if (!testsTableNeedsRebuild(sql => database.execute(sql))) return;

  const currentDefinition = V3_DRAFT_SCHEMA_STATEMENTS.find(statement =>
    statement.includes('CREATE TABLE IF NOT EXISTS tests ('),
  );
  if (!currentDefinition) {
    throw new Error('The tests table definition is missing from the V3 schema.');
  }
  const columns = v3RowsToArray<{name: string}>(database.execute('PRAGMA table_info(tests)'))
    .map(column => column.name)
    .join(', ');
  const violationsBefore = countTestsLinkViolations(sql => database.execute(sql));

  database.execute('PRAGMA foreign_keys = OFF');
  try {
    await database.transaction(transaction => {
      if (!testsTableNeedsRebuild(sql => transaction.execute(sql))) return;
      // With foreign keys on, DROP TABLE tests would cascade-delete every
      // test_parts row (ON DELETE CASCADE). Refuse rather than risk that.
      const foreignKeys = v3RowsToArray<{foreign_keys: number}>(transaction.execute('PRAGMA foreign_keys'))[0];
      if (Number(foreignKeys?.foreign_keys) !== 0) {
        throw new Error('Foreign keys are still on; the local tests table was not rebuilt.');
      }
      transaction.execute(
        currentDefinition.replace('CREATE TABLE IF NOT EXISTS tests (', 'CREATE TABLE tests_rebuild ('),
      );
      transaction.execute(`INSERT INTO tests_rebuild (${columns}) SELECT ${columns} FROM tests`);
      transaction.execute('DROP TABLE tests');
      transaction.execute('ALTER TABLE tests_rebuild RENAME TO tests');
      if (countTestsLinkViolations(sql => transaction.execute(sql)) > violationsBefore) {
        throw new Error('Rebuilding the local tests table would break existing links; nothing was changed.');
      }
    });
  } finally {
    database.execute('PRAGMA foreign_keys = ON');
  }
};

// Several screens call initV3Database at startup at the same time; the
// rebuild must run once, not concurrently (a second run could execute with
// foreign keys switched back on by the first).
let testsRebuild: Promise<void> | null = null;

export const initV3Database = async (): Promise<void> => {
  const database = getV3Database();

  testsRebuild ??= rebuildTestsTableWithoutItemMinimum(database).catch(error => {
    testsRebuild = null;
    throw error;
  });
  await testsRebuild;
  database.execute('PRAGMA foreign_keys = ON');
  database.execute('PRAGMA journal_mode = WAL');

  await database.transaction(transaction => {
    V3_DRAFT_SCHEMA_STATEMENTS.forEach(statement =>
      transaction.execute(statement),
    );
    patchDynamicObjectiveOutboxWrittenVerificationUuids(transaction);
    transaction.execute(
      `INSERT INTO schema_versions (
         schema_version_id, version_number, contract_version, applied_at
       ) VALUES (1, ?, '3.0', ?)
       ON CONFLICT(schema_version_id) DO UPDATE SET
         version_number = excluded.version_number,
         contract_version = excluded.contract_version,
         applied_at = excluded.applied_at`,
      [V3_DRAFT_SCHEMA_VERSION, v3NowIso()],
    );
    transaction.execute(`PRAGMA user_version = ${V3_DRAFT_SCHEMA_VERSION}`);
  });
};

export const closeV3Database = (): void => {
  connection?.close();
  connection = null;
};
