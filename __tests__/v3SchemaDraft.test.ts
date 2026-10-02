import {
  V3_CENTRAL_BASELINE_CHECK_COUNT,
  V3_CENTRAL_BASELINE_FOREIGN_KEY_COUNT,
  V3_CENTRAL_BASELINE_MIGRATION,
  V3_CENTRAL_BASELINE_TABLE_COUNT,
  V3_CENTRAL_BASELINE_UNIQUE_COUNT,
  V3_DRAFT_MOBILE_ONLY_TABLES,
  V3_DRAFT_SCHEMA_STATEMENTS,
  V3_DRAFT_SHARED_TABLES,
  V3_DRAFT_TABLES,
} from '../src/database/v3/schema';
import {
  V3_ACTIVE_ENDPOINT_SWITCH_AUTHORIZED,
  V3_MOBILE_MIGRATION_PLAN,
  V3_PENDING_BACKEND_CONTRACT_DECISIONS,
  V3_PRODUCTION_SQLITE_MIGRATION_AUTHORIZED,
  V3_V2_RESULT_CARRYOVER_AUTHORIZED,
} from '../src/database/v3/migrationPlan';

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

const tableNamePattern = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i;

describe('isolated V3 SQLite draft', () => {
  test('pins the reconciled V3_014 central baseline', () => {
    expect(V3_CENTRAL_BASELINE_MIGRATION).toBe(
      'V3_014_academic_calendar_and_class_schedules',
    );
    expect(V3_CENTRAL_BASELINE_TABLE_COUNT).toBe(67);
    expect(V3_CENTRAL_BASELINE_FOREIGN_KEY_COUNT).toBe(163);
    expect(V3_CENTRAL_BASELINE_CHECK_COUNT).toBe(87);
    expect(V3_CENTRAL_BASELINE_UNIQUE_COUNT).toBe(99);
  });

  test('declares the expected shared and Mobile-only ownership sets', () => {
    expect(V3_DRAFT_SHARED_TABLES).toHaveLength(22);
    expect(V3_DRAFT_MOBILE_ONLY_TABLES).toHaveLength(21);
    expect(V3_DRAFT_TABLES).toHaveLength(43);
    expect(new Set(V3_DRAFT_TABLES).size).toBe(V3_DRAFT_TABLES.length);

    expect(V3_DRAFT_TABLES).toEqual(
      expect.arrayContaining([
        'test_assignments',
        'question_types',
        'question_options',
        'part_skill_mappings',
        'class_assignment_schedules',
        'answer_sheet_versions',
        'answer_sheet_pages',
        'answer_sheet_regions',
        'scan_pages',
        'answer_verifications',
        'answer_rubric_scores',
        'reference_data_state',
        'download_snapshot_rows',
        'syncs',
        'sync_items',
        'objective_outbox',
        'dynamic_objective_outbox',
      ]),
    );
  });

  test('creates every declared table exactly once without destructive SQL', () => {
    const createdTables = V3_DRAFT_SCHEMA_STATEMENTS.flatMap(statement => {
      const match = statement.match(tableNamePattern);
      return match ? [match[1]] : [];
    });
    const combinedSql = V3_DRAFT_SCHEMA_STATEMENTS.join('\n').toLowerCase();

    expect(createdTables).toHaveLength(V3_DRAFT_TABLES.length);
    expect(new Set(createdTables).size).toBe(createdTables.length);
    expect(new Set(createdTables)).toEqual(new Set(V3_DRAFT_TABLES));
    expect(combinedSql).not.toMatch(/\bdrop\s+table\b/);
    expect(combinedSql).not.toMatch(/\balter\s+table\b/);
    expect(combinedSql).not.toMatch(/\bdelete\s+from\b/);
    expect(combinedSql).toContain("'reopened'");
    expect(combinedSql).toContain("'ocr_corrected'");
    expect(combinedSql).toContain("'manual_scored'");
  });

  test('does not restore V2-only or server-secret tables', () => {
    [
      'answer_keys',
      'question_mappings',
      'sync_batches',
      'sync_result_items',
      'performance_rule_sets',
      'answer_sheets',
    ].forEach(tableName => expect(V3_DRAFT_TABLES).not.toContain(tableName));
  });

  test('keeps production migration, endpoint switching, and V2 carryover blocked', () => {
    expect(V3_PRODUCTION_SQLITE_MIGRATION_AUTHORIZED).toBe(false);
    expect(V3_ACTIVE_ENDPOINT_SWITCH_AUTHORIZED).toBe(false);
    expect(V3_V2_RESULT_CARRYOVER_AUTHORIZED).toBe(false);
    expect(V3_PENDING_BACKEND_CONTRACT_DECISIONS.length).toBeGreaterThan(0);

    const productionMutations = V3_MOBILE_MIGRATION_PLAN.filter(
      phase => phase.mutatesProductionState,
    );
    expect(productionMutations.every(phase => !phase.authorizedNow)).toBe(true);
  });

  test('keeps central identities and evidence history needed for future upload', () => {
    const sql = V3_DRAFT_SCHEMA_STATEMENTS.join('\n').toLowerCase();

    expect(sql).toContain('central_answer_sheet_version_id integer unique');
    expect(sql).toContain('central_answer_sheet_page_id integer unique');
    expect(sql).toContain('central_answer_sheet_region_id integer unique');
    expect(sql).toContain('captured_page_count integer not null');
    expect(sql).toContain("'original_page', 'normalized_page'");
    expect(sql).toContain("'answer_crop', 'teacher_evidence'");
    expect(sql).toContain('server_percentage_snapshot real');
    expect(sql).toContain('idempotency_version integer not null');
    expect(sql).toContain('answer verification history cannot be deleted');
  });

  test('keeps analytics authoritative on the backend', () => {
    const sql = V3_DRAFT_SCHEMA_STATEMENTS.join('\n').toLowerCase();

    expect(V3_DRAFT_TABLES).toEqual(
      expect.arrayContaining([
        'test_results',
        'student_answers',
        'answer_verifications',
        'answer_rubric_scores',
        'answer_attachments',
        'scan_sessions',
        'scan_pages',
        'omr_detections',
        'syncs',
        'sync_items',
      ]),
    );
    expect(sql).toContain('server_total_score real');
    expect(sql).toContain('server_points_earned real');
    expect(sql).toContain('server_performance_status text');
    expect(sql).toContain('captured_page_count integer not null');
    expect(sql).not.toContain('received_page_count');
    expect(sql).not.toContain('enhanced_answer_crop');
  });

  const sqliteProbe = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' });
  const sqliteTest = sqliteProbe.error ? test.skip : test;

  sqliteTest(
    'executes cleanly in disposable SQLite with valid foreign keys',
    () => {
      const sql = [
        'PRAGMA foreign_keys = ON',
        'BEGIN',
        ...V3_DRAFT_SCHEMA_STATEMENTS,
        'COMMIT',
        'PRAGMA foreign_key_check',
        'PRAGMA integrity_check',
        `SELECT 'TABLE_COUNT=' || COUNT(*)
         FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'`,
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
      expect(result.stdout).toContain(`TABLE_COUNT=${V3_DRAFT_TABLES.length}`);
    },
  );
});
