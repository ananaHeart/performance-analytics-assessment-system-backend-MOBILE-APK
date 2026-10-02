import {getV2Database, rowsToArray} from './database';

export interface V2ClassListItem {
  storage_version: 'v2';
  class_id: number;
  class_assignment_id: number;
  teacher_id: number;
  subject_id: number;
  subject_name: string;
  section_id: number;
  section_name: string;
  grade_level_id: number;
  grade_level_name: string;
  academic_year_id: number;
  academic_year: string;
  student_count: number;
}

export interface V2TestListItem {
  storage_version: 'v2';
  test_id: number;
  class_id: number;
  class_assignment_id: number;
  test_name: string;
  test_type: string;
  test_date: string;
  grading_period_id: number;
  test_status: string;
  total_items: number;
  checking_status: 'Ready to check' | 'Pending Upload' | 'Uploaded';
}

export interface V2RosterItem {
  storage_version: 'v2';
  student_id: number;
  class_list_id: number;
  student_lrn: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  score: number;
  maxScore: number;
  is_checked: number;
  is_synced: number;
}

export interface V2TestSyncStatus {
  totalStudents: number;
  checkedStudents: number;
  syncedStudents: number;
  unsyncedStudents: number;
  uncheckedStudents: number;
}

export const getV2ClassesByTeacher = (teacherId: number): V2ClassListItem[] => {
  const result = getV2Database().execute(
    `SELECT
       'v2' AS storage_version,
       c.class_id,
       ca.class_assignment_id,
       ca.user_id AS teacher_id,
       ca.subject_id,
       ca.subject_name,
       c.section_id,
       c.section_name,
       c.grade_level_id,
       c.grade_level_name,
       c.academic_year_id,
       c.year_name AS academic_year,
       COUNT(DISTINCT cl.class_list_id) AS student_count
     FROM class_assignments ca
     INNER JOIN classes c ON c.class_id = ca.class_id
     LEFT JOIN class_lists cl ON cl.class_id = c.class_id
     WHERE ca.user_id = ?
     GROUP BY
       c.class_id,
       ca.class_assignment_id,
       ca.user_id,
       ca.subject_id,
       ca.subject_name,
       c.section_id,
       c.section_name,
       c.grade_level_id,
       c.grade_level_name,
       c.academic_year_id,
       c.year_name
     ORDER BY c.grade_level_name, c.section_name, ca.subject_name`,
    [teacherId],
  );

  return rowsToArray<V2ClassListItem>(result);
};

export const getV2TestsByClass = (
  classId: number,
  classAssignmentId?: number | null,
): V2TestListItem[] => {
  const assignmentFilter = classAssignmentId == null
    ? ''
    : 'AND t.class_assignment_id = ?';
  const bindings = classAssignmentId == null
    ? [classId]
    : [classId, classAssignmentId];

  const result = getV2Database().execute(
    `SELECT
       'v2' AS storage_version,
       t.test_id,
       ca.class_id,
       t.class_assignment_id,
       t.test_name,
       t.test_type,
       t.test_date,
       t.term_period_id AS grading_period_id,
       t.status AS test_status,
       t.total_items,
       CASE
         WHEN EXISTS (
           SELECT 1
           FROM test_results tr
           WHERE tr.test_id = t.test_id
             AND tr.result_status = 'verified'
             AND tr.is_synced = 0
         ) THEN 'Pending Upload'
         WHEN EXISTS (
           SELECT 1
           FROM test_results tr
           WHERE tr.test_id = t.test_id AND tr.is_synced = 1
         ) THEN 'Uploaded'
         ELSE 'Ready to check'
       END AS checking_status
     FROM tests t
     INNER JOIN class_assignments ca ON ca.class_assignment_id = t.class_assignment_id
     WHERE ca.class_id = ?
       ${assignmentFilter}
     ORDER BY t.test_date, t.test_id`,
    bindings,
  );

  return rowsToArray<V2TestListItem>(result);
};

export const getV2RosterForTest = (testId: number, classId: number): V2RosterItem[] => {
  const result = getV2Database().execute(
    `SELECT
       'v2' AS storage_version,
       s.student_id,
       cl.class_list_id,
       s.student_lrn,
       s.first_name,
       s.middle_name,
       s.last_name,
       s.suffix,
       COALESCE(tr.provisional_total_score, 0) AS score,
       COALESCE(tr.provisional_max_score, t.total_items, 0) AS maxScore,
       CASE WHEN tr.result_status = 'verified' THEN 1 ELSE 0 END AS is_checked,
       CASE WHEN tr.result_status = 'verified' AND tr.is_synced = 1 THEN 1 ELSE 0 END AS is_synced
     FROM tests t
     INNER JOIN class_assignments ca ON ca.class_assignment_id = t.class_assignment_id
     INNER JOIN class_lists cl ON cl.class_id = ca.class_id
     INNER JOIN students s ON s.student_id = cl.student_id
     LEFT JOIN test_results tr ON tr.test_result_id = (
       SELECT latest.test_result_id
       FROM test_results latest
       WHERE latest.test_id = t.test_id
         AND latest.class_list_id = cl.class_list_id
       ORDER BY latest.attempt_number DESC, latest.updated_at DESC
       LIMIT 1
     )
     WHERE t.test_id = ?
       AND ca.class_id = ?
     ORDER BY s.last_name, s.first_name, s.student_id`,
    [testId, classId],
  );

  return rowsToArray<V2RosterItem>(result);
};

export const getV2TestSyncStatus = (testId: number, classId: number): V2TestSyncStatus => {
  const students = getV2RosterForTest(testId, classId);
  const checkedStudents = students.filter(student => Number(student.is_checked) === 1).length;
  const syncedStudents = students.filter(student => Number(student.is_synced) === 1).length;
  return {
    totalStudents: students.length,
    checkedStudents,
    syncedStudents,
    unsyncedStudents: Math.max(0, checkedStudents - syncedStudents),
    uncheckedStudents: Math.max(0, students.length - checkedStudents),
  };
};
