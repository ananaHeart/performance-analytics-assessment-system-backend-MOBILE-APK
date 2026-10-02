import type {
  QueryResult,
  QuickSQLiteConnection,
} from 'react-native-quick-sqlite';

import { getV3OfflineDiagnosticSnapshot } from '../src/database/v3/diagnosticRepository';

jest.mock('../src/database/v3/database', () => ({
  getV3Database: jest.fn(),
  v3RowsToArray: (result: QueryResult) => result.rows?._array ?? [],
}));

const queryResult = (rows: unknown[]): QueryResult => ({
  rowsAffected: 0,
  rows: {
    _array: rows,
    length: rows.length,
    item: index => rows[index],
  },
});

const readyDatabase = (): QuickSQLiteConnection =>
  ({
    execute: (sql: string) => {
      if (sql.includes('FROM schema_versions')) {
        return queryResult([{ version_number: 3 }]);
      }
      if (sql.includes('FROM reference_data_state')) {
        return queryResult([
          {
            server_time: '2026-09-07T08:00:00Z',
            refreshed_at: '2026-09-07T08:01:00Z',
            payload_hash: 'a'.repeat(64),
          },
        ]);
      }
      if (sql.includes("snapshot.snapshot_status = 'complete'")) {
        return queryResult([
          {
            download_snapshot_id: 9,
            snapshot_uuid: '00000000-0000-5000-8000-000000000009',
            generated_at: '2026-09-07T08:00:00Z',
            downloaded_at: '2026-09-07T08:01:00Z',
            committed_at: '2026-09-07T08:01:01Z',
            email: 'teacher@example.com',
            school_id: 'SCHOOL-001',
          },
        ]);
      }
      if (sql.includes('FROM download_snapshot_entities entity')) {
        return queryResult([
          { entity_name: 'classes', expected_count: 1, active_count: 1 },
          {
            entity_name: 'class_assignments',
            expected_count: 1,
            active_count: 1,
          },
          { entity_name: 'class_lists', expected_count: 27, active_count: 27 },
          { entity_name: 'students', expected_count: 27, active_count: 27 },
          { entity_name: 'tests', expected_count: 1, active_count: 1 },
          {
            entity_name: 'test_assignments',
            expected_count: 1,
            active_count: 1,
          },
          { entity_name: 'test_parts', expected_count: 2, active_count: 2 },
          { entity_name: 'questions', expected_count: 10, active_count: 10 },
          {
            entity_name: 'answer_sheet_versions',
            expected_count: 1,
            active_count: 1,
          },
        ]);
      }
      if (sql.includes('FROM class_assignments assignment')) {
        return queryResult([
          {
            class_assignment_id: 200,
            class_id: 300,
            grade_level_name: 'Grade 7',
            section_name: 'Rizal',
            subject_name: 'English',
            assignment_status: 'active',
            student_count: 27,
            assessment_count: 1,
          },
        ]);
      }
      if (sql.includes('FROM test_assignments test_assignment')) {
        return queryResult([
          {
            test_assignment_id: 12001,
            test_id: 1006,
            class_assignment_id: 200,
            class_id: 300,
            assignment_uuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
            test_name: 'English Quiz 2',
            grade_level_name: 'Grade 7',
            section_name: 'Rizal',
            subject_name: 'English',
            term_name: 'First Quarter',
            assignment_status: 'open',
            capture_availability: 'open',
            close_at: '2026-09-08T08:00:00Z',
            total_items: 10,
            answer_sheet_count: 1,
          },
        ]);
      }
      if (sql.includes('FROM answer_sheet_versions answer_sheet')) {
        return queryResult([
          {
            answer_sheet_uuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
            assignment_uuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
            test_name: 'English Quiz 2',
            paper_size_code: 'A4',
            total_pages: 1,
            downloaded_pages: 1,
            total_questions: 10,
            downloaded_regions: 10,
            required_scanner_version: '2.0.0',
          },
        ]);
      }
      throw new Error(`Unexpected diagnostic SQL: ${sql}`);
    },
  } as QuickSQLiteConnection);

describe('V3 active snapshot diagnostics', () => {
  test('maps only the complete snapshot into offline diagnostics', () => {
    const result = getV3OfflineDiagnosticSnapshot(readyDatabase());

    expect(result.status).toBe('ready');
    expect(result.activeSnapshot?.teacherEmail).toBe('teacher@example.com');
    expect(result.counts).toMatchObject({
      classes: 1,
      students: 27,
      testAssignments: 1,
      questions: 10,
      answerSheets: 1,
      readyManifests: 1,
    });
    expect(result.classes[0]).toMatchObject({
      gradeLevelName: 'Grade 7',
      sectionName: 'Rizal',
      className: 'Grade 7 - Rizal',
      subjectName: 'English',
      studentCount: 27,
    });
    expect(result.assessments[0]).toMatchObject({
      testName: 'English Quiz 2',
      testId: 1006,
      classAssignmentId: 200,
      classId: 300,
    });
    expect(result.answerSheets[0].manifestReady).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('reports an empty initialized database without reading stale tables', () => {
    const database = {
      execute: (sql: string) => {
        if (sql.includes('FROM schema_versions')) {
          return queryResult([{ version_number: 3 }]);
        }
        return queryResult([]);
      },
    } as QuickSQLiteConnection;

    const result = getV3OfflineDiagnosticSnapshot(database);

    expect(result.status).toBe('empty');
    expect(result.schemaVersion).toBe(3);
    expect(result.activeSnapshot).toBeNull();
    expect(result.classes).toEqual([]);
    expect(result.issues).toContain(
      'V3 reference data has not been downloaded.',
    );
  });

  test('flags incomplete manifest evidence', () => {
    const database = readyDatabase();
    const originalExecute = database.execute.bind(database);
    database.execute = (sql, params) => {
      if (sql.includes('FROM answer_sheet_versions answer_sheet')) {
        return queryResult([
          {
            answer_sheet_uuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
            assignment_uuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
            test_name: 'English Quiz 2',
            paper_size_code: 'A4',
            total_pages: 2,
            downloaded_pages: 1,
            total_questions: 10,
            downloaded_regions: 5,
            required_scanner_version: '2.0.0',
          },
        ]);
      }
      return originalExecute(sql, params);
    };

    const result = getV3OfflineDiagnosticSnapshot(database);

    expect(result.status).toBe('attention');
    expect(result.counts.readyManifests).toBe(0);
    expect(result.issues[0]).toContain('manifest is incomplete');
  });
});
