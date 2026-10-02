import type { QueryResult, Transaction } from 'react-native-quick-sqlite';

const mockStatements: Array<{ sql: string; params: unknown[] }> = [];
const mockRegionIds = new Map<string, number>();

const resultWithRows = (rows: unknown[]): QueryResult => ({
  rowsAffected: 0,
  rows: {
    _array: rows,
    length: rows.length,
    item: index => rows[index],
  },
});

const mockTransaction: Transaction = {
  commit: () => ({ rowsAffected: 0 }),
  rollback: () => ({ rowsAffected: 0 }),
  executeAsync: async () => ({ rowsAffected: 0 }),
  execute: (sql, params = []) => {
    mockStatements.push({ sql, params });
    if (/SELECT answer_sheet_version_id, manifest_hash/i.test(sql)) {
      return resultWithRows([
        {
          answer_sheet_version_id: 1,
          manifest_hash:
            'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          assignment_uuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
          test_assignment_id: 12001,
          paper_size_id: 1,
          test_version_number: 1,
          total_questions: 10,
          total_pages: 1,
        },
      ]);
    }
    if (/SELECT paper_size_id, width_points/i.test(sql)) {
      return resultWithRows([
        { paper_size_id: 1, width_points: 595.276, height_points: 841.89 },
      ]);
    }
    if (/SELECT paper_size_id AS id/i.test(sql)) {
      return resultWithRows([{ id: 1 }]);
    }
    if (/SELECT download_snapshot_id, payload_hash/i.test(sql)) {
      return resultWithRows([]);
    }
    if (/SELECT download_snapshot_id\s+FROM download_snapshots/i.test(sql)) {
      return resultWithRows([{ download_snapshot_id: 1 }]);
    }
    if (/SELECT COUNT\(\*\) AS count\s+FROM answer_sheet_pages/i.test(sql)) {
      return resultWithRows([{ count: 0 }]);
    }
    if (/SELECT omr_template_id, template_version/i.test(sql)) {
      return resultWithRows([
        {
          omr_template_id: 1,
          template_version: '2',
          geometry_hash:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          paper_size_code: 'A4',
          orientation: 'portrait',
        },
      ]);
    }
    if (/SELECT q\.question_uuid, q\.test_part_id/i.test(sql)) {
      const questionId = Number(params[0]);
      return resultWithRows([
        {
          question_uuid: `00000000-0000-4000-8000-${String(questionId).padStart(
            12,
            '0',
          )}`,
          test_part_id: 21001,
          global_item_number: questionId - 30000,
          question_type_code: 'multiple_choice',
        },
      ]);
    }
    if (/SELECT answer_sheet_page_id AS id/i.test(sql)) {
      return resultWithRows([{ id: 1 }]);
    }
    if (/SELECT answer_sheet_region_id AS id/i.test(sql)) {
      const uuid = String(params[0]);
      if (!mockRegionIds.has(uuid)) {
        mockRegionIds.set(uuid, mockRegionIds.size + 1);
      }
      return resultWithRows([{ id: mockRegionIds.get(uuid) }]);
    }
    return { rowsAffected: 0 };
  },
};

jest.mock('../src/database/v3/database', () => ({
  v3NowIso: () => '2026-09-07T00:00:00.000Z',
  v3RowsToArray: (result: QueryResult) => result.rows?._array ?? [],
  withV3Transaction: async (
    callback: (transaction: Transaction) => void | Promise<void>,
  ) => callback(mockTransaction),
}));

const { parseV3MobileDownloadEnvelope, parseV3MobileReferenceDataEnvelope } =
  jest.requireActual(
    '../src/database/v3/parsers',
  ) as typeof import('../src/database/v3/parsers');
const { parseV3AnswerSheetManifestEnvelope } = jest.requireActual(
  '../src/database/v3/parsers',
) as typeof import('../src/database/v3/parsers');
const { saveV3MobileDownload } = jest.requireActual(
  '../src/database/v3/downloadRepository',
) as typeof import('../src/database/v3/downloadRepository');
const { saveV3ReferenceData } = jest.requireActual(
  '../src/database/v3/referenceDataRepository',
) as typeof import('../src/database/v3/referenceDataRepository');
const { saveV3AnswerSheetManifest } = jest.requireActual(
  '../src/database/v3/manifestRepository',
) as typeof import('../src/database/v3/manifestRepository');
const { V3_DRAFT_SCHEMA_STATEMENTS } = jest.requireActual(
  '../src/database/v3/schema',
) as typeof import('../src/database/v3/schema');
const {
  V3_DIAGNOSTIC_ACTIVE_SNAPSHOT_SQL,
  V3_DIAGNOSTIC_ENTITY_COUNTS_SQL,
  V3_DIAGNOSTIC_CLASSES_SQL,
  V3_DIAGNOSTIC_ASSESSMENTS_SQL,
  V3_DIAGNOSTIC_ANSWER_SHEETS_SQL,
} = jest.requireActual(
  '../src/database/v3/diagnosticRepository',
) as typeof import('../src/database/v3/diagnosticRepository');

interface SpawnResult {
  error?: Error;
  status: number | null;
  stdout: string;
  stderr: string;
}

const { spawnSync } = jest.requireActual('child_process') as {
  spawnSync: (
    command: string,
    arguments_: string[],
    options: { encoding: 'utf8'; input?: string },
  ) => SpawnResult;
};

const referenceFixture = jest.requireActual(
  './fixtures/v3/mobile/reference-data-response.json',
) as unknown;
const downloadFixture = jest.requireActual(
  './fixtures/v3/mobile/download-response.json',
) as unknown;
const manifestFixture = jest.requireActual(
  './fixtures/v3/mobile/answer-sheet-manifest-response.json',
) as unknown;

const sqlLiteral = (value: unknown): string => {
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  throw new Error(`Unsupported SQLite test value ${typeof value}.`);
};

const bindSql = (sql: string, params: unknown[]): string => {
  let parameterIndex = 0;
  const bound = sql.replace(/\?/g, () => {
    const value = params[parameterIndex];
    parameterIndex += 1;
    return sqlLiteral(value);
  });
  if (parameterIndex !== params.length) {
    throw new Error('SQLite test parameter count mismatch.');
  }
  return bound;
};

describe('V3 isolated reference and download persistence', () => {
  beforeEach(() => {
    mockStatements.splice(0, mockStatements.length);
    mockRegionIds.clear();
  });

  test('generates an executable atomic snapshot write set', async () => {
    const reference = parseV3MobileReferenceDataEnvelope(referenceFixture);
    const download = parseV3MobileDownloadEnvelope(downloadFixture);

    const referenceResult = await saveV3ReferenceData(reference.data);
    const downloadResult = await saveV3MobileDownload(download.data);

    expect(referenceResult.questionTypeCount).toBe(5);
    expect(downloadResult.status).toBe('committed');
    expect(downloadResult.entityCounts.answer_sheet_versions).toBe(1);
    expect(mockStatements.some(item => /DELETE\s+FROM/i.test(item.sql))).toBe(
      false,
    );

    const sqliteProbe = spawnSync('sqlite3', ['-version'], {
      encoding: 'utf8',
    });
    if (sqliteProbe.error) {
      return;
    }

    const sql = [
      'PRAGMA foreign_keys = ON',
      'BEGIN',
      ...V3_DRAFT_SCHEMA_STATEMENTS,
      ...mockStatements.map(statement =>
        bindSql(statement.sql, statement.params),
      ),
      'COMMIT',
      'PRAGMA foreign_key_check',
      'PRAGMA integrity_check',
      `SELECT 'COMPLETE=' || COUNT(*) FROM download_snapshots WHERE snapshot_status = 'complete'`,
      `SELECT 'ASSIGNMENTS=' || COUNT(*) FROM test_assignments`,
      `SELECT 'CLASS_STATUS=' || status FROM classes WHERE class_id = 300`,
      `SELECT 'SCHEDULES=' || COUNT(*) FROM class_assignment_schedules`,
      `SELECT 'SCHEDULE_TZ=' || timezone_name FROM class_assignment_schedules WHERE class_assignment_schedule_id = 70001`,
      `SELECT 'MEMBERSHIPS=' || COUNT(*) FROM download_snapshot_rows`,
    ]
      .map(statement => `${statement};`)
      .join('\n');
    const result = spawnSync('sqlite3', [':memory:'], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('ok');
    expect(result.stdout).toContain('COMPLETE=1');
    expect(result.stdout).toContain('ASSIGNMENTS=1');
    expect(result.stdout).toContain('CLASS_STATUS=active');
    expect(result.stdout).toContain('SCHEDULES=1');
    expect(result.stdout).toContain('SCHEDULE_TZ=Asia/Manila');
    expect(result.stdout).toContain('MEMBERSHIPS=18');
  });

  test('rejects a broken reference before opening a transaction', async () => {
    const download = parseV3MobileDownloadEnvelope(downloadFixture);
    const invalid = {
      ...download.data,
      classLists: [
        {
          ...download.data.classLists[0],
          studentId: 999999,
        },
      ],
    };

    await expect(saveV3MobileDownload(invalid)).rejects.toThrow(
      'Class membership references missing id 999999.',
    );
    expect(mockStatements).toHaveLength(0);
  });

  test('persists a complete immutable answer-sheet manifest', async () => {
    const reference = parseV3MobileReferenceDataEnvelope(referenceFixture);
    const download = parseV3MobileDownloadEnvelope(downloadFixture);
    const manifest = parseV3AnswerSheetManifestEnvelope(manifestFixture);
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...download.data.questions[0],
      questionId: 30001 + index,
      questionUuid: `00000000-0000-4000-8000-${String(30001 + index).padStart(
        12,
        '0',
      )}`,
      itemNumber: index + 1,
      globalItemNumber: index + 1,
    }));
    const questionOptions = questions.flatMap((question, questionIndex) =>
      ['A', 'B', 'C', 'D'].map((key, optionIndex) => ({
        questionOptionId: questionIndex * 4 + optionIndex + 1,
        questionId: question.questionId,
        optionKey: key,
        optionText: `Option ${key}`,
        optionOrder: optionIndex + 1,
      })),
    );
    const basePage = manifest.data.pages[0];
    const baseRegion = basePage.regions[0];
    const completeManifest = {
      ...manifest.data,
      pages: [
        {
          ...basePage,
          regions: questions.map((question, index) => ({
            ...baseRegion,
            regionUuid: `00000000-0000-4000-9000-${String(index + 1).padStart(
              12,
              '0',
            )}`,
            templateRegionCode: `OBJECTIVE_SLOT_${String(index + 1).padStart(
              2,
              '0',
            )}`,
            questionId: question.questionId,
            questionUuid: question.questionUuid,
            globalItemNumber: index + 1,
            partItemNumber: index + 1,
            rectangle: { ...baseRegion.rectangle, y: 700 - index * 30 },
            options: baseRegion.options.map(option => ({
              ...option,
              centerY: 706.4 - index * 30,
            })),
          })),
        },
      ],
    };

    await saveV3ReferenceData(reference.data);
    await saveV3MobileDownload({
      ...download.data,
      questions,
      questionOptions,
    });
    const manifestResult = await saveV3AnswerSheetManifest(completeManifest);

    expect(manifestResult.status).toBe('committed');
    expect(manifestResult.regionCount).toBe(10);
    expect(manifestResult.optionCount).toBe(40);

    const sqliteProbe = spawnSync('sqlite3', ['-version'], {
      encoding: 'utf8',
    });
    if (sqliteProbe.error) {
      return;
    }
    const sql = [
      'PRAGMA foreign_keys = ON',
      'BEGIN',
      ...V3_DRAFT_SCHEMA_STATEMENTS,
      ...mockStatements.map(statement =>
        bindSql(statement.sql, statement.params),
      ),
      'COMMIT',
      'PRAGMA foreign_key_check',
      'PRAGMA integrity_check',
      `SELECT 'PAGES=' || COUNT(*) FROM answer_sheet_pages`,
      `SELECT 'REGIONS=' || COUNT(*) FROM answer_sheet_regions`,
      `SELECT 'OPTIONS=' || COUNT(*) FROM answer_sheet_region_options`,
      `SELECT 'DIAGNOSTIC_SNAPSHOT=' || COUNT(*) FROM (${V3_DIAGNOSTIC_ACTIVE_SNAPSHOT_SQL})`,
      `SELECT 'DIAGNOSTIC_ENTITIES=' || COUNT(*) FROM (${bindSql(
        V3_DIAGNOSTIC_ENTITY_COUNTS_SQL,
        [1],
      )})`,
      `SELECT 'DIAGNOSTIC_CLASSES=' || COUNT(*) FROM (${bindSql(
        V3_DIAGNOSTIC_CLASSES_SQL,
        [1],
      )})`,
      `SELECT 'DIAGNOSTIC_ASSESSMENTS=' || COUNT(*) FROM (${bindSql(
        V3_DIAGNOSTIC_ASSESSMENTS_SQL,
        [1],
      )})`,
      `SELECT 'DIAGNOSTIC_SHEETS=' || COUNT(*) FROM (${bindSql(
        V3_DIAGNOSTIC_ANSWER_SHEETS_SQL,
        [1],
      )})`,
    ]
      .map(statement => `${statement};`)
      .join('\n');
    const result = spawnSync('sqlite3', [':memory:'], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('ok');
    expect(result.stdout).toContain('PAGES=1');
    expect(result.stdout).toContain('REGIONS=10');
    expect(result.stdout).toContain('OPTIONS=40');
    expect(result.stdout).toContain('DIAGNOSTIC_SNAPSHOT=1');
    expect(result.stdout).toContain('DIAGNOSTIC_ENTITIES=15');
    expect(result.stdout).toContain('DIAGNOSTIC_CLASSES=1');
    expect(result.stdout).toContain('DIAGNOSTIC_ASSESSMENTS=1');
    expect(result.stdout).toContain('DIAGNOSTIC_SHEETS=1');
  });
});
