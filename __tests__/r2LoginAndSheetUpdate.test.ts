/**
 * Round-2 revisions:
 * - R2-9: the scan screen says when an assessment's answer sheet changed
 *   since the teacher last saw it on this phone.
 * Runs the real schema on SQLite.
 */
import type { QueryResult } from 'react-native-quick-sqlite';

jest.mock('../src/database/v3/database', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite');
  const mockDb = new DatabaseSync(':memory:');
  const execute = (sql: string, params: unknown[] = []): QueryResult => {
    const rows = mockDb.prepare(sql).all(...params) as unknown[];
    return { rowsAffected: 0, rows: { _array: rows, length: rows.length, item: (i: number) => rows[i] } };
  };
  return {
    mockDb,
    getV3Database: () => ({ execute }),
    v3RowsToArray: (result: QueryResult) => result.rows?._array ?? [],
    v3NowIso: () => new Date().toISOString(),
  };
});

const { mockDb } = jest.requireMock('../src/database/v3/database') as {
  mockDb: { exec: (sql: string) => void };
};
const { V3_DRAFT_SCHEMA_STATEMENTS } = jest.requireActual('../src/database/v3/schema') as typeof import('../src/database/v3/schema');
const { acknowledgeV3AnswerSheet, getV3AnswerSheetChanged } =
  jest.requireActual('../src/database/v3/objectiveRepository') as typeof import('../src/database/v3/objectiveRepository');

const SHEET_V1 = '11111111-1111-4111-8111-111111111111';
const SHEET_V2 = '22222222-2222-4222-8222-222222222222';

describe('R2-9: answer sheet changed since last seen', () => {
  beforeAll(() => {
    V3_DRAFT_SCHEMA_STATEMENTS.forEach(statement => mockDb.exec(statement));
    // Only the test_assignments row matters here; its parents are not needed.
    mockDb.exec('PRAGMA foreign_keys = OFF');
    mockDb.exec(`INSERT INTO test_assignments (
      test_assignment_id, assignment_uuid, test_id, class_assignment_id, assignment_status,
      allow_late_capture, capture_allowed_now, capture_availability)
      VALUES (1, '33333333-3333-4333-8333-333333333333', 1, 1, 'open', 0, 1, 'open')`);
  });

  test('first visit records the sheet without a warning', () => {
    expect(getV3AnswerSheetChanged(1, SHEET_V1)).toBe(false);
    expect(getV3AnswerSheetChanged(1, SHEET_V1)).toBe(false);
  });

  test('a new answer sheet (layout changed) shows the warning until acknowledged', () => {
    expect(getV3AnswerSheetChanged(1, SHEET_V2)).toBe(true);
    expect(getV3AnswerSheetChanged(1, SHEET_V2)).toBe(true);
    acknowledgeV3AnswerSheet(1, SHEET_V2);
    expect(getV3AnswerSheetChanged(1, SHEET_V2)).toBe(false);
  });

  test('an answer-key-only change keeps the same sheet, so no warning', () => {
    expect(getV3AnswerSheetChanged(1, SHEET_V2)).toBe(false);
  });

  test('an assessment not on this phone never warns', () => {
    expect(getV3AnswerSheetChanged(999, SHEET_V1)).toBe(false);
  });
});
