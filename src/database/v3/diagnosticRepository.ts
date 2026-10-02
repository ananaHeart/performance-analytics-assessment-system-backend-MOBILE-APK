import type { QuickSQLiteConnection } from 'react-native-quick-sqlite';

import { getV3Database, v3RowsToArray } from './database';

export interface V3DiagnosticReferenceState {
  serverTime: string;
  refreshedAt: string;
  payloadHash: string;
}

export interface V3DiagnosticActiveSnapshot {
  snapshotUuid: string;
  generatedAt: string;
  downloadedAt: string;
  committedAt: string;
  teacherEmail: string;
  schoolId: string;
}

export interface V3DiagnosticCounts {
  classes: number;
  classAssignments: number;
  classLists: number;
  students: number;
  tests: number;
  testAssignments: number;
  testParts: number;
  questions: number;
  answerSheets: number;
  readyManifests: number;
}

export interface V3DiagnosticClass {
  classAssignmentId: number;
  classId: number;
  gradeLevelName: string;
  sectionName: string;
  className: string;
  subjectName: string;
  assignmentStatus: string;
  studentCount: number;
  assessmentCount: number;
}

export interface V3DiagnosticAssessment {
  testAssignmentId: number;
  testId: number;
  classAssignmentId: number;
  classId: number;
  assignmentUuid: string;
  testName: string;
  className: string;
  subjectName: string;
  termName: string;
  assignmentStatus: string;
  captureAvailability: string;
  closeAt: string | null;
  totalItems: number;
  answerSheetCount: number;
}

export interface V3DiagnosticAnswerSheet {
  answerSheetUuid: string;
  assignmentUuid: string;
  testName: string;
  paperSize: string;
  totalPages: number;
  downloadedPages: number;
  totalQuestions: number;
  downloadedRegions: number;
  manifestReady: boolean;
  requiredScannerVersion: string;
}

export interface V3OfflineDiagnosticSnapshot {
  status: 'empty' | 'ready' | 'attention';
  schemaVersion: number | null;
  referenceData: V3DiagnosticReferenceState | null;
  activeSnapshot: V3DiagnosticActiveSnapshot | null;
  counts: V3DiagnosticCounts;
  classes: V3DiagnosticClass[];
  assessments: V3DiagnosticAssessment[];
  answerSheets: V3DiagnosticAnswerSheet[];
  issues: string[];
}

interface SchemaVersionRow {
  version_number: number;
}

interface ReferenceStateRow {
  server_time: string;
  refreshed_at: string;
  payload_hash: string;
}

interface ActiveSnapshotRow {
  download_snapshot_id: number;
  snapshot_uuid: string;
  generated_at: string;
  downloaded_at: string;
  committed_at: string;
  email: string;
  school_id: string;
}

interface EntityCountRow {
  entity_name: string;
  expected_count: number;
  active_count: number;
}

interface ClassRow {
  class_assignment_id: number;
  class_id: number;
  grade_level_name: string;
  section_name: string;
  subject_name: string;
  assignment_status: string;
  student_count: number;
  assessment_count: number;
}

interface AssessmentRow {
  test_assignment_id: number;
  test_id: number;
  class_assignment_id: number;
  class_id: number;
  assignment_uuid: string;
  test_name: string;
  grade_level_name: string;
  section_name: string;
  subject_name: string;
  term_name: string;
  assignment_status: string;
  capture_availability: string;
  close_at: string | null;
  total_items: number;
  answer_sheet_count: number;
}

interface AnswerSheetRow {
  answer_sheet_uuid: string;
  assignment_uuid: string;
  test_name: string;
  paper_size_code: string;
  total_pages: number;
  downloaded_pages: number;
  total_questions: number;
  downloaded_regions: number;
  required_scanner_version: string;
}

export const V3_DIAGNOSTIC_ACTIVE_SNAPSHOT_SQL = `
  SELECT snapshot.download_snapshot_id,
         snapshot.snapshot_uuid,
         snapshot.generated_at,
         snapshot.downloaded_at,
         snapshot.committed_at,
         teacher.email,
         teacher.school_id
    FROM download_snapshots snapshot
    JOIN users teacher
      ON teacher.user_id = snapshot.teacher_user_id
   WHERE snapshot.snapshot_status = 'complete'
   ORDER BY snapshot.committed_at DESC
   LIMIT 1
`;

// The signed-in teacher's own latest download. Without this, a teacher whose
// download failed (or who hasn't downloaded yet) was shown whichever teacher
// last downloaded on this phone.
export const V3_DIAGNOSTIC_TEACHER_SNAPSHOT_SQL = `
  SELECT snapshot.download_snapshot_id,
         snapshot.snapshot_uuid,
         snapshot.generated_at,
         snapshot.downloaded_at,
         snapshot.committed_at,
         teacher.email,
         teacher.school_id
    FROM download_snapshots snapshot
    JOIN users teacher
      ON teacher.user_id = snapshot.teacher_user_id
   WHERE snapshot.snapshot_status = 'complete'
     AND snapshot.teacher_user_id = ?
   ORDER BY snapshot.committed_at DESC
   LIMIT 1
`;

export const V3_DIAGNOSTIC_ENTITY_COUNTS_SQL = `
  SELECT entity.entity_name,
         entity.row_count AS expected_count,
         COUNT(snapshot_row.download_snapshot_row_id) AS active_count
    FROM download_snapshot_entities entity
    LEFT JOIN download_snapshot_rows snapshot_row
      ON snapshot_row.download_snapshot_id = entity.download_snapshot_id
     AND snapshot_row.entity_name = entity.entity_name
   WHERE entity.download_snapshot_id = ?
   GROUP BY entity.download_snapshot_entity_id,
            entity.entity_name,
            entity.row_count
   ORDER BY entity.entity_name
`;

export const V3_DIAGNOSTIC_CLASSES_SQL = `
  SELECT assignment.class_assignment_id,
         class_row.class_id,
         class_row.grade_level_name,
         class_row.section_name,
         assignment.subject_name,
         assignment.assignment_status,
         COUNT(DISTINCT CASE
           WHEN list_membership.download_snapshot_row_id IS NOT NULL
           THEN class_list.class_list_id
         END) AS student_count,
         COUNT(DISTINCT CASE
           WHEN test_membership.download_snapshot_row_id IS NOT NULL
           THEN test_assignment.test_assignment_id
         END) AS assessment_count
    FROM class_assignments assignment
    JOIN download_snapshot_rows assignment_membership
      ON assignment_membership.download_snapshot_id = ?
     AND assignment_membership.entity_name = 'class_assignments'
     AND assignment_membership.entity_key = CAST(assignment.class_assignment_id AS TEXT)
    JOIN classes class_row
      ON class_row.class_id = assignment.class_id
    JOIN download_snapshot_rows class_membership
      ON class_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND class_membership.entity_name = 'classes'
     AND class_membership.entity_key = CAST(class_row.class_id AS TEXT)
    LEFT JOIN class_lists class_list
      ON class_list.class_id = class_row.class_id
    LEFT JOIN download_snapshot_rows list_membership
      ON list_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND list_membership.entity_name = 'class_lists'
     AND list_membership.entity_key = CAST(class_list.class_list_id AS TEXT)
    LEFT JOIN test_assignments test_assignment
      ON test_assignment.class_assignment_id = assignment.class_assignment_id
    LEFT JOIN download_snapshot_rows test_membership
      ON test_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND test_membership.entity_name = 'test_assignments'
     AND test_membership.entity_key = CAST(test_assignment.test_assignment_id AS TEXT)
   -- Defense in depth: an archived class or class assignment must never be
   -- shown to a teacher, in this list or anywhere else in the app, even if a
   -- future backend bug ever included one in a download payload by mistake
   -- (the same class of bug that leaked draft-test children today).
   WHERE class_row.status != 'archived'
     AND assignment.assignment_status != 'archived'
   GROUP BY assignment.class_assignment_id,
            class_row.class_id,
            class_row.grade_level_name,
            class_row.section_name,
            assignment.subject_name,
            assignment.assignment_status
   ORDER BY class_row.grade_level_name,
            class_row.section_name,
            assignment.subject_name
`;

export const V3_DIAGNOSTIC_ASSESSMENTS_SQL = `
  SELECT test_assignment.test_assignment_id,
         test_row.test_id,
         class_assignment.class_assignment_id,
         class_row.class_id,
         test_assignment.assignment_uuid,
         test_row.test_name,
         class_row.grade_level_name,
         class_row.section_name,
         class_assignment.subject_name,
         term.term_name,
         test_assignment.assignment_status,
         test_assignment.capture_availability,
         test_assignment.close_at,
         test_row.total_items,
         COUNT(DISTINCT CASE
           WHEN sheet_membership.download_snapshot_row_id IS NOT NULL
           THEN answer_sheet.answer_sheet_version_id
         END) AS answer_sheet_count
    FROM test_assignments test_assignment
    JOIN download_snapshot_rows assignment_membership
      ON assignment_membership.download_snapshot_id = ?
     AND assignment_membership.entity_name = 'test_assignments'
     AND assignment_membership.entity_key = CAST(test_assignment.test_assignment_id AS TEXT)
    JOIN tests test_row
      ON test_row.test_id = test_assignment.test_id
    JOIN download_snapshot_rows test_membership
      ON test_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND test_membership.entity_name = 'tests'
     AND test_membership.entity_key = CAST(test_row.test_id AS TEXT)
    JOIN class_assignments class_assignment
      ON class_assignment.class_assignment_id = test_assignment.class_assignment_id
    JOIN download_snapshot_rows class_assignment_membership
      ON class_assignment_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND class_assignment_membership.entity_name = 'class_assignments'
     AND class_assignment_membership.entity_key = CAST(class_assignment.class_assignment_id AS TEXT)
    JOIN classes class_row
      ON class_row.class_id = class_assignment.class_id
    JOIN download_snapshot_rows class_membership
      ON class_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND class_membership.entity_name = 'classes'
     AND class_membership.entity_key = CAST(class_row.class_id AS TEXT)
    JOIN term_periods term
      ON term.term_period_id = test_row.term_period_id
    JOIN download_snapshot_rows term_membership
      ON term_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND term_membership.entity_name = 'term_periods'
     AND term_membership.entity_key = CAST(term.term_period_id AS TEXT)
    LEFT JOIN answer_sheet_versions answer_sheet
      ON answer_sheet.test_assignment_id = test_assignment.test_assignment_id
    LEFT JOIN download_snapshot_rows sheet_membership
      ON sheet_membership.download_snapshot_id = assignment_membership.download_snapshot_id
     AND sheet_membership.entity_name = 'answer_sheet_versions'
     AND sheet_membership.entity_key = answer_sheet.answer_sheet_uuid
   -- Defense in depth, mirroring the backend's own sync-eligibility rule: a
   -- draft or archived test must stay web-only, and a test under an archived
   -- class/class-assignment must never surface to a teacher here, even if a
   -- future backend bug ever included one in a download payload by mistake.
   WHERE test_row.status NOT IN ('draft', 'archived')
     AND class_row.status != 'archived'
     AND class_assignment.assignment_status != 'archived'
   GROUP BY test_assignment.test_assignment_id,
            test_row.test_id,
            class_assignment.class_assignment_id,
            class_row.class_id,
            test_assignment.assignment_uuid,
            test_row.test_name,
            class_row.grade_level_name,
            class_row.section_name,
            class_assignment.subject_name,
            term.term_name,
            test_assignment.assignment_status,
            test_assignment.capture_availability,
            test_assignment.close_at,
            test_row.total_items
   ORDER BY test_assignment.close_at IS NULL,
            test_assignment.close_at,
            test_row.test_name
`;

export const V3_DIAGNOSTIC_ANSWER_SHEETS_SQL = `
  SELECT answer_sheet.answer_sheet_uuid,
         answer_sheet.assignment_uuid,
         test_row.test_name,
         paper_size.paper_size_code,
         answer_sheet.total_pages,
         COUNT(DISTINCT page.answer_sheet_page_id) AS downloaded_pages,
         answer_sheet.total_questions,
         COUNT(DISTINCT region.answer_sheet_region_id) AS downloaded_regions,
         answer_sheet.required_scanner_version
    FROM answer_sheet_versions answer_sheet
    JOIN download_snapshot_rows sheet_membership
      ON sheet_membership.download_snapshot_id = ?
     AND sheet_membership.entity_name = 'answer_sheet_versions'
     AND sheet_membership.entity_key = answer_sheet.answer_sheet_uuid
    JOIN test_assignments test_assignment
      ON test_assignment.test_assignment_id = answer_sheet.test_assignment_id
    JOIN download_snapshot_rows assignment_membership
      ON assignment_membership.download_snapshot_id = sheet_membership.download_snapshot_id
     AND assignment_membership.entity_name = 'test_assignments'
     AND assignment_membership.entity_key = CAST(test_assignment.test_assignment_id AS TEXT)
    JOIN tests test_row
      ON test_row.test_id = test_assignment.test_id
    JOIN download_snapshot_rows test_membership
      ON test_membership.download_snapshot_id = sheet_membership.download_snapshot_id
     AND test_membership.entity_name = 'tests'
     AND test_membership.entity_key = CAST(test_row.test_id AS TEXT)
    JOIN paper_sizes paper_size
      ON paper_size.paper_size_id = answer_sheet.paper_size_id
    LEFT JOIN answer_sheet_pages page
      ON page.answer_sheet_version_id = answer_sheet.answer_sheet_version_id
    LEFT JOIN answer_sheet_regions region
      ON region.answer_sheet_version_id = answer_sheet.answer_sheet_version_id
   GROUP BY answer_sheet.answer_sheet_version_id,
            answer_sheet.answer_sheet_uuid,
            answer_sheet.assignment_uuid,
            test_row.test_name,
            paper_size.paper_size_code,
            answer_sheet.total_pages,
            answer_sheet.total_questions,
            answer_sheet.required_scanner_version
   ORDER BY test_row.test_name,
            paper_size.paper_size_code
`;

const EMPTY_COUNTS: V3DiagnosticCounts = {
  classes: 0,
  classAssignments: 0,
  classLists: 0,
  students: 0,
  tests: 0,
  testAssignments: 0,
  testParts: 0,
  questions: 0,
  answerSheets: 0,
  readyManifests: 0,
};

const firstRow = <T>(
  database: QuickSQLiteConnection,
  sql: string,
  params: unknown[] = [],
): T | null =>
  v3RowsToArray<T>(params.length ? database.execute(sql, params) : database.execute(sql))[0] ?? null;

const entityCount = (
  counts: ReadonlyMap<string, number>,
  entityName: string,
): number => counts.get(entityName) ?? 0;

/**
 * Pass the signed-in teacher's user id whenever there is one, so only that
 * teacher's own download is ever shown. Without it (device diagnostics before
 * anyone signs in), this returns the latest download on the phone.
 */
export const getV3OfflineDiagnosticSnapshot = (
  database: QuickSQLiteConnection = getV3Database(),
  teacherUserId: number | null = null,
): V3OfflineDiagnosticSnapshot => {
  const schemaRow = firstRow<SchemaVersionRow>(
    database,
    `SELECT version_number FROM schema_versions WHERE schema_version_id = 1`,
  );
  const referenceRow = firstRow<ReferenceStateRow>(
    database,
    `SELECT server_time, refreshed_at, payload_hash
       FROM reference_data_state
      WHERE reference_data_state_id = 1`,
  );
  const snapshotRow = teacherUserId == null
    ? firstRow<ActiveSnapshotRow>(database, V3_DIAGNOSTIC_ACTIVE_SNAPSHOT_SQL)
    : firstRow<ActiveSnapshotRow>(database, V3_DIAGNOSTIC_TEACHER_SNAPSHOT_SQL, [teacherUserId]);
  const referenceData = referenceRow
    ? {
        serverTime: referenceRow.server_time,
        refreshedAt: referenceRow.refreshed_at,
        payloadHash: referenceRow.payload_hash,
      }
    : null;

  if (!snapshotRow) {
    return {
      status: 'empty',
      schemaVersion: schemaRow ? Number(schemaRow.version_number) : null,
      referenceData,
      activeSnapshot: null,
      counts: { ...EMPTY_COUNTS },
      classes: [],
      assessments: [],
      answerSheets: [],
      issues: referenceData
        ? ['No complete V3 download snapshot is stored on this device.']
        : [
            'V3 reference data has not been downloaded.',
            'No complete V3 download snapshot is stored on this device.',
          ],
    };
  }

  const snapshotId = Number(snapshotRow.download_snapshot_id);
  const entityRows = v3RowsToArray<EntityCountRow>(
    database.execute(V3_DIAGNOSTIC_ENTITY_COUNTS_SQL, [snapshotId]),
  );
  const countMap = new Map(
    entityRows.map(row => [row.entity_name, Number(row.active_count)]),
  );
  const classRows = v3RowsToArray<ClassRow>(
    database.execute(V3_DIAGNOSTIC_CLASSES_SQL, [snapshotId]),
  );
  const assessmentRows = v3RowsToArray<AssessmentRow>(
    database.execute(V3_DIAGNOSTIC_ASSESSMENTS_SQL, [snapshotId]),
  );
  const answerSheetRows = v3RowsToArray<AnswerSheetRow>(
    database.execute(V3_DIAGNOSTIC_ANSWER_SHEETS_SQL, [snapshotId]),
  );
  const answerSheets: V3DiagnosticAnswerSheet[] = answerSheetRows.map(row => {
    const downloadedPages = Number(row.downloaded_pages);
    const downloadedRegions = Number(row.downloaded_regions);
    const totalPages = Number(row.total_pages);
    const totalQuestions = Number(row.total_questions);
    return {
      answerSheetUuid: row.answer_sheet_uuid,
      assignmentUuid: row.assignment_uuid,
      testName: row.test_name,
      paperSize: row.paper_size_code,
      totalPages,
      downloadedPages,
      totalQuestions,
      downloadedRegions,
      manifestReady:
        downloadedPages === totalPages && downloadedRegions === totalQuestions,
      requiredScannerVersion: row.required_scanner_version,
    };
  });
  const issues: string[] = [];

  if (!referenceData) {
    issues.push('V3 reference data is missing.');
  }
  entityRows.forEach(row => {
    if (Number(row.expected_count) !== Number(row.active_count)) {
      issues.push(
        `${row.entity_name} snapshot membership is incomplete: ${Number(
          row.active_count,
        )}/${Number(row.expected_count)} rows.`,
      );
    }
  });
  answerSheets.forEach(sheet => {
    if (!sheet.manifestReady) {
      issues.push(
        `${sheet.testName} ${sheet.paperSize} manifest is incomplete: ${sheet.downloadedPages}/${sheet.totalPages} pages and ${sheet.downloadedRegions}/${sheet.totalQuestions} regions.`,
      );
    }
  });

  return {
    status: issues.length ? 'attention' : 'ready',
    schemaVersion: schemaRow ? Number(schemaRow.version_number) : null,
    referenceData,
    activeSnapshot: {
      snapshotUuid: snapshotRow.snapshot_uuid,
      generatedAt: snapshotRow.generated_at,
      downloadedAt: snapshotRow.downloaded_at,
      committedAt: snapshotRow.committed_at,
      teacherEmail: snapshotRow.email,
      schoolId: snapshotRow.school_id,
    },
    counts: {
      classes: entityCount(countMap, 'classes'),
      classAssignments: entityCount(countMap, 'class_assignments'),
      classLists: entityCount(countMap, 'class_lists'),
      students: entityCount(countMap, 'students'),
      tests: entityCount(countMap, 'tests'),
      testAssignments: entityCount(countMap, 'test_assignments'),
      testParts: entityCount(countMap, 'test_parts'),
      questions: entityCount(countMap, 'questions'),
      answerSheets: entityCount(countMap, 'answer_sheet_versions'),
      readyManifests: answerSheets.filter(sheet => sheet.manifestReady).length,
    },
    classes: classRows.map(row => ({
      classAssignmentId: Number(row.class_assignment_id),
      classId: Number(row.class_id),
      gradeLevelName: row.grade_level_name,
      sectionName: row.section_name,
      className: `${row.grade_level_name} - ${row.section_name}`,
      subjectName: row.subject_name,
      assignmentStatus: row.assignment_status,
      studentCount: Number(row.student_count),
      assessmentCount: Number(row.assessment_count),
    })),
    assessments: assessmentRows.map(row => ({
      testAssignmentId: Number(row.test_assignment_id),
      testId: Number(row.test_id),
      classAssignmentId: Number(row.class_assignment_id),
      classId: Number(row.class_id),
      assignmentUuid: row.assignment_uuid,
      testName: row.test_name,
      className: `${row.grade_level_name} - ${row.section_name}`,
      subjectName: row.subject_name,
      termName: row.term_name,
      assignmentStatus: row.assignment_status,
      captureAvailability: row.capture_availability,
      closeAt: row.close_at,
      totalItems: Number(row.total_items),
      answerSheetCount: Number(row.answer_sheet_count),
    })),
    answerSheets,
    issues,
  };
};
