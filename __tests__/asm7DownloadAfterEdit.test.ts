/**
 * ASM-7 regression: after a teacher edits an ACTIVE assessment, the backend
 * replaces its parts/questions/answer sheets with new rows. The next download
 * failed on the phone with "UNIQUE constraint failed: test_parts.test_id,
 * test_parts.part_order" (seen on 2026-11-02). Runs the real schema and the
 * real download writer against SQLite.
 */
import type { QueryResult, Transaction } from 'react-native-quick-sqlite';

jest.mock('../src/database/v3/database', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite');
  const mockDb = new DatabaseSync(':memory:');
  mockDb.exec('PRAGMA foreign_keys = ON');
  const toParam = (value: unknown) =>
    value === undefined ? null : typeof value === 'boolean' ? Number(value) : value;
  const execute = (sql: string, params: unknown[] = []): QueryResult => {
    const rows = mockDb.prepare(sql).all(...params.map(toParam)) as unknown[];
    return { rowsAffected: 0, rows: { _array: rows, length: rows.length, item: (i: number) => rows[i] } };
  };
  const transaction = { execute } as unknown as Transaction;
  return {
    mockDb,
    v3NowIso: () => new Date().toISOString(),
    v3RowsToArray: (result: QueryResult) => result.rows?._array ?? [],
    getV3Database: () => ({ execute }),
    withV3Transaction: async (callback: (tx: Transaction) => void | Promise<void>) => {
      mockDb.exec('BEGIN');
      try {
        await callback(transaction);
        mockDb.exec('COMMIT');
      } catch (error) {
        mockDb.exec('ROLLBACK');
        throw error;
      }
    },
  };
});

const { mockDb } = jest.requireMock('../src/database/v3/database') as {
  mockDb: { exec: (sql: string) => void; prepare: (sql: string) => { all: (...p: unknown[]) => unknown[] } };
};
const { V3_DRAFT_SCHEMA_STATEMENTS } = jest.requireActual('../src/database/v3/schema') as typeof import('../src/database/v3/schema');
const { parseV3MobileDownloadEnvelope, parseV3MobileReferenceDataEnvelope } =
  jest.requireActual('../src/database/v3/parsers') as typeof import('../src/database/v3/parsers');
const { saveV3MobileDownload } = jest.requireActual('../src/database/v3/downloadRepository') as typeof import('../src/database/v3/downloadRepository');
const { saveV3ReferenceData } = jest.requireActual('../src/database/v3/referenceDataRepository') as typeof import('../src/database/v3/referenceDataRepository');

const referenceFixture = jest.requireActual('./fixtures/v3/mobile/reference-data-response.json');
const downloadFixture = jest.requireActual('./fixtures/v3/mobile/download-response.json');

const count = (sql: string) => (mockDb.prepare(sql).all()[0] as { n: number }).n;

// What the backend sends after the teacher edits the first test: the same
// structure under brand-new part/question/option/mapping ids.
const editedDownload = (original: any) => {
  const copy = JSON.parse(JSON.stringify(original));
  const data = copy.data;
  const testId = data.tests[0].testId;
  const editedParts = new Set<number>(
    data.testParts.filter((part: any) => part.testId === testId).map((part: any) => part.testPartId),
  );
  const editedQuestions = new Set<number>(
    data.questions.filter((q: any) => editedParts.has(q.testPartId)).map((q: any) => q.questionId),
  );
  data.testParts.forEach((part: any) => {
    if (editedParts.has(part.testPartId)) part.testPartId += 500000;
  });
  data.questions.forEach((q: any) => {
    if (editedParts.has(q.testPartId)) q.testPartId += 500000;
    if (editedQuestions.has(q.questionId)) q.questionId += 500000;
  });
  (data.questionOptions ?? []).forEach((o: any) => {
    if (editedQuestions.has(o.questionId)) {
      o.questionId += 500000;
      o.questionOptionId += 500000;
    }
  });
  (data.partSkillMappings ?? []).forEach((m: any) => {
    if (editedParts.has(m.testPartId)) {
      m.testPartId += 500000;
      m.partSkillMappingId += 500000;
    }
  });
  data.answerSheets = (data.answerSheets ?? []).filter(
    (sheet: any) => !data.testAssignments.some((a: any) => a.testId === testId && a.testAssignmentId === sheet.testAssignmentId),
  );
  if (copy.data.snapshot?.snapshotUuid) copy.data.snapshot.snapshotUuid = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
  return copy;
};

describe('ASM-7: download after an assessment was edited', () => {
  beforeAll(async () => {
    V3_DRAFT_SCHEMA_STATEMENTS.forEach(statement => mockDb.exec(statement));
    await saveV3ReferenceData(parseV3MobileReferenceDataEnvelope(referenceFixture).data);
    await saveV3MobileDownload(parseV3MobileDownloadEnvelope(downloadFixture).data);
  });

  test('the new download is saved and the old parts and questions are gone', async () => {
    const edited = editedDownload(downloadFixture);
    await expect(
      saveV3MobileDownload(parseV3MobileDownloadEnvelope(edited).data),
    ).resolves.toBeDefined();

    const data = edited.data;
    expect(count('SELECT COUNT(*) AS n FROM test_parts')).toBe(data.testParts.length);
    expect(count('SELECT COUNT(*) AS n FROM questions')).toBe(data.questions.length);
    // Parts keep their real order numbers (none left parked above 100000).
    expect(count('SELECT COUNT(*) AS n FROM test_parts WHERE part_order > 100000')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM questions WHERE item_number > 100000')).toBe(0);
    expect(mockDb.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
