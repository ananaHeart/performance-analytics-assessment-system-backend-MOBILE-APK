// src/database/db.js
import { open } from 'react-native-quick-sqlite';
import { TABLES } from './schema';
import { getSyncDownloadUrl } from '../config/api';
import { syncAllUnsyncedToServer, syncToServer } from './syncService';

const db = open({ name: 'AssessmentStorage.db' });
const nowIsoString = () => new Date().toISOString();
const nowMySQL = () => {
  const d = new Date();
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const generateUuidV4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (8 + (random % 4));
    return value.toString(16);
  });
};

const toRowArray = (result) => {
  const rows = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i));
  }
  return rows;
};

const escapeIdentifier = (value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQLite identifier: ${value}`);
  }
  return value;
};

const replaceRows = (tableName, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  rows.forEach((row) => {
    const columns = Object.keys(row);
    if (columns.length === 0) {
      return;
    }

    const safeTableName = escapeIdentifier(tableName);
    const safeColumns = columns.map(escapeIdentifier);
    const placeholders = safeColumns.map(() => '?').join(', ');
    const params = safeColumns.map(col => row[col]);

    db.execute(
      `INSERT OR REPLACE INTO ${safeTableName} (${safeColumns.join(', ')})
       VALUES (${placeholders})`,
      params,
    );
  });
};

const insertOrIgnoreRows = (tableName, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  rows.forEach((row) => {
    const columns = Object.keys(row);
    if (columns.length === 0) {
      return;
    }

    const safeTableName = escapeIdentifier(tableName);
    const safeColumns = columns.map(escapeIdentifier);
    const placeholders = safeColumns.map(() => '?').join(', ');
    const params = safeColumns.map(col => row[col]);

    db.execute(
      `INSERT OR IGNORE INTO ${safeTableName} (${safeColumns.join(', ')})
       VALUES (${placeholders})`,
      params,
    );
  });
};

const addColumnIfMissing = (tableName, columnName, definition) => {
  try {
    db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    console.log(`DB PATCH: Added ${columnName} to ${tableName}.`);
  } catch (error) {
    console.log(`DB PATCH: Column ${columnName} already exists on ${tableName}.`);
  }
};

const createIndexIfMissing = (indexName, tableName, columnName) => {
  db.execute(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnName})`);
};

const createUniqueIndexIfMissing = (indexName, tableName, columns) => {
  db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`);
};

const hasTable = (tableName) => {
  const result = db.execute(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name = ?`,
    [tableName],
  );
  return result.rows.length > 0;
};

const hasColumn = (tableName, columnName) => {
  if (!hasTable(tableName)) {
    return false;
  }

  const columns = toRowArray(db.execute(`PRAGMA table_info(${tableName})`));
  return columns.some((column) => column.name === columnName);
};

const resolveTestPartRecord = (identifier) => {
  const directMatch = db.execute(
    `SELECT test_part_id, test_id, answer_key
     FROM test_parts
     WHERE test_part_id = ?
     LIMIT 1`,
    [identifier],
  );

  if (directMatch.rows.length > 0) {
    return directMatch.rows.item(0);
  }

  const testMatch = db.execute(
    `SELECT test_part_id, test_id, answer_key
     FROM test_parts
     WHERE test_id = ?
     ORDER BY test_part_id
     LIMIT 1`,
    [identifier],
  );

  if (testMatch.rows.length > 0) {
    return testMatch.rows.item(0);
  }

  return null;
};

const getLocalResultIdByTestResultId = (testResultId) => {
  const result = db.execute(
    `SELECT local_result_id
     FROM test_results
     WHERE test_result_id = ?
     LIMIT 1`,
    [testResultId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows.item(0).local_result_id || null;
};

const parseAnswerKey = (answerKey) => {
  const map = {};
  if (!answerKey || typeof answerKey !== 'string') {
    return map;
  }

  answerKey
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value, index) => {
      map[index + 1] = value;
    });

  return map;
};

const parseAnswerKeyArray = (answerKey) => {
  if (!answerKey || typeof answerKey !== 'string') {
    return [];
  }

  return answerKey
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

const getExistingLocalTestResultRecord = (testId, studentId) => {
  const result = db.execute(
    `SELECT test_result_id, local_result_id, test_id, student_id
     FROM test_results
     WHERE test_id = ?
       AND student_id = ?
     ORDER BY updated_at DESC, test_result_id DESC
     LIMIT 1`,
    [testId, studentId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows.item(0);
};

const getTestResultRecordById = (testResultId) => {
  const result = db.execute(
    `SELECT test_result_id, local_result_id, test_id, student_id
     FROM test_results
     WHERE test_result_id = ?
     LIMIT 1`,
    [testResultId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows.item(0);
};

const buildRawAnswersString = (localResultId) => {
  const rows = toRowArray(
    db.execute(
      `SELECT test_part_id, item_number, is_correct
       FROM item_responses
       WHERE local_result_id = ?
       ORDER BY test_part_id, item_number`,
      [localResultId],
    )
  );

  return rows
    .map((row) => `${row.test_part_id}:${row.item_number}=${row.is_correct === 1 ? 'T' : 'F'}`)
    .join('|');
};

const backfillTeacherIds = () => {
  if (hasColumn('classes', 'teacher_id') && hasColumn('classes', 'user_id')) {
    db.execute(
      `UPDATE classes
       SET teacher_id = COALESCE(teacher_id, user_id)
       WHERE teacher_id IS NULL`,
    );
  }
};

const backfillStudentEnrollments = () => {
  if (!hasTable('student_enrollments')) {
    return;
  }

  db.execute(
    `INSERT OR IGNORE INTO student_enrollments (
       student_id,
       section_id,
       section_name,
       grade_level_id,
       grade_level_name,
       academic_year_id,
       academic_year
     )
     SELECT
       student_id,
       section_id,
       section_name,
       grade_level_id,
       grade_level_name,
       academic_year_id,
       academic_year
     FROM students
     WHERE student_id IS NOT NULL
       AND section_id IS NOT NULL
       AND grade_level_id IS NOT NULL
       AND academic_year_id IS NOT NULL`,
  );
};

const logPreviewRows = (label, rows, keys) => {
  const preview = rows.slice(0, 5).map((row) => {
    const snapshot = {};
    keys.forEach((key) => {
      snapshot[key] = row[key] ?? null;
    });
    return snapshot;
  });

  console.log(`${label}:`, preview);
};

const getPayloadValue = (row, keys, fallback = null) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return fallback;
};

const buildBackendLocalResultId = (testResultId) => `backend-${testResultId}`;
const buildBackendLocalResponseId = (itemResultId) => `backend-item-${itemResultId}`;

const upsertRowOnConflict = (tableName, row, conflictColumns) => {
  const columns = Object.keys(row);
  if (columns.length === 0) {
    return;
  }

  const safeTableName = escapeIdentifier(tableName);
  const safeColumns = columns.map(escapeIdentifier);
  const safeConflictColumns = conflictColumns.map(escapeIdentifier);
  const placeholders = safeColumns.map(() => '?').join(', ');
  const params = safeColumns.map((column) => row[column]);
  const updateColumns = safeColumns.filter((column) => !safeConflictColumns.includes(column));
  const updateClause = updateColumns.length > 0
    ? updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')
    : safeConflictColumns.map((column) => `${column} = excluded.${column}`).join(', ');

  db.execute(
    `INSERT INTO ${safeTableName} (${safeColumns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(${safeConflictColumns.join(', ')})
     DO UPDATE SET ${updateClause}`,
    params,
  );
};

const getSelectedClassRecord = (classId) => {
  const result = db.execute(
    `SELECT
       class_id,
       subject_name,
       section_id,
       section_name,
       grade_level_id,
       grade_level_name,
       academic_year_id,
       academic_year
     FROM classes
     WHERE class_id = ?
     LIMIT 1`,
    [classId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows.item(0);
};

const getRosterMatchCounts = (selectedClass) => {
  const allStudents = db.execute('SELECT COUNT(*) AS count FROM students');
  const allEnrollments = db.execute('SELECT COUNT(*) AS count FROM student_enrollments');
  const sectionMatches = db.execute(
    `SELECT COUNT(DISTINCT student_id) AS count
     FROM student_enrollments
     WHERE section_id = ?`,
    [selectedClass.section_id],
  );
  const sectionGradeMatches = db.execute(
    `SELECT COUNT(DISTINCT student_id) AS count
     FROM student_enrollments
     WHERE section_id = ?
       AND grade_level_id = ?`,
    [selectedClass.section_id, selectedClass.grade_level_id],
  );
  const strictMatches = db.execute(
    `SELECT COUNT(DISTINCT student_id) AS count
     FROM student_enrollments
     WHERE section_id = ?
       AND grade_level_id = ?
       AND academic_year_id = ?`,
    [
      selectedClass.section_id,
      selectedClass.grade_level_id,
      selectedClass.academic_year_id,
    ],
  );
  const strictEnrollmentRows = db.execute(
    `SELECT COUNT(*) AS count
     FROM student_enrollments
     WHERE section_id = ?
       AND grade_level_id = ?
       AND academic_year_id = ?`,
    [
      selectedClass.section_id,
      selectedClass.grade_level_id,
      selectedClass.academic_year_id,
    ],
  );

  return {
    totalStudents: allStudents.rows.item(0)?.count || 0,
    totalEnrollments: allEnrollments.rows.item(0)?.count || 0,
    sectionMatches: sectionMatches.rows.item(0)?.count || 0,
    sectionGradeMatches: sectionGradeMatches.rows.item(0)?.count || 0,
    strictMatches: strictMatches.rows.item(0)?.count || 0,
    strictEnrollmentRows: strictEnrollmentRows.rows.item(0)?.count || 0,
  };
};

const logRosterFallbackDiagnostics = (selectedClass) => {
  const counts = getRosterMatchCounts(selectedClass);
  const distinctEnrollments = toRowArray(
    db.execute(
      `SELECT DISTINCT
         section_id,
         section_name,
         grade_level_id,
         grade_level_name,
         academic_year_id,
         academic_year
       FROM student_enrollments
       ORDER BY section_id, grade_level_id, academic_year_id
       LIMIT 20`,
    ),
  );

  console.log('ROSTER DEBUG: strict roster returned 0, running fallback diagnostics.');
  console.log('ROSTER DEBUG: count all students =', counts.totalStudents);
  console.log('ROSTER DEBUG: count students with same section_id =', counts.sectionMatches);
  console.log('ROSTER DEBUG: count students with same section_id + grade_level_id =', counts.sectionGradeMatches);
  console.log('ROSTER DEBUG: count students with same section_id + grade_level_id + academic_year_id =', counts.strictMatches);
  console.log('ROSTER DEBUG: distinct student_enrollments values =', distinctEnrollments);
};

const backfillLocalResultIds = () => {
  const rows = toRowArray(
    db.execute(
      `SELECT test_result_id
       FROM test_results
       WHERE local_result_id IS NULL OR TRIM(local_result_id) = ''`,
    )
  );

  const hasLegacyMobileUuid = hasColumn('test_results', 'mobile_uuid');

  rows.forEach((row) => {
    let localResultId = null;

    if (hasLegacyMobileUuid) {
      const legacyValue = db.execute(
        `SELECT mobile_uuid
         FROM test_results
         WHERE test_result_id = ?
         LIMIT 1`,
        [row.test_result_id],
      );
      if (legacyValue.rows.length > 0) {
        localResultId = legacyValue.rows.item(0).mobile_uuid || null;
      }
    }

    db.execute(
      `UPDATE test_results
       SET local_result_id = ?,
           updated_at = COALESCE(NULLIF(updated_at, ''), ?)
       WHERE test_result_id = ?`,
      [localResultId || generateUuidV4(), nowIsoString(), row.test_result_id],
    );
  });
};

const backfillLocalResponseIds = () => {
  const rows = toRowArray(
    db.execute(
      `SELECT response_id
       FROM item_responses
       WHERE local_response_id IS NULL OR TRIM(local_response_id) = ''`,
    )
  );

  const hasLegacyMobileUuid = hasColumn('item_responses', 'mobile_uuid');

  rows.forEach((row) => {
    let localResponseId = null;

    if (hasLegacyMobileUuid) {
      const legacyValue = db.execute(
        `SELECT mobile_uuid
         FROM item_responses
         WHERE response_id = ?
         LIMIT 1`,
        [row.response_id],
      );
      if (legacyValue.rows.length > 0) {
        localResponseId = legacyValue.rows.item(0).mobile_uuid || null;
      }
    }

    db.execute(
      `UPDATE item_responses
       SET local_response_id = ?,
           updated_at = COALESCE(NULLIF(updated_at, ''), ?)
       WHERE response_id = ?`,
      [localResponseId || generateUuidV4(), nowIsoString(), row.response_id],
    );
  });
};

const backfillItemResponseLocalResultIds = () => {
  if (!hasColumn('item_responses', 'local_result_id') || !hasColumn('item_responses', 'test_result_id')) {
    return;
  }

  const rows = toRowArray(
    db.execute(
      `SELECT response_id, test_result_id
       FROM item_responses
       WHERE local_result_id IS NULL OR TRIM(local_result_id) = ''`,
    )
  );

  rows.forEach((row) => {
    const localResultId = getLocalResultIdByTestResultId(row.test_result_id);
    if (!localResultId) {
      return;
    }

    db.execute(
      `UPDATE item_responses
       SET local_result_id = ?,
           updated_at = COALESCE(NULLIF(updated_at, ''), ?)
       WHERE response_id = ?`,
      [localResultId, nowIsoString(), row.response_id],
    );
  });
};

const migrateLegacyQuestionsToTestParts = () => {
  if (!hasTable('questions')) {
    return;
  }

  const testsWithoutParts = toRowArray(
    db.execute(
      `SELECT t.test_id
       FROM tests t
       WHERE NOT EXISTS (
         SELECT 1
         FROM test_parts tp
         WHERE tp.test_id = t.test_id
       )`,
    )
  );

  testsWithoutParts.forEach((test) => {
    const answers = toRowArray(
      db.execute(
        `SELECT item_number, correct_answer
         FROM questions
         WHERE test_part_id = ?
         ORDER BY item_number`,
        [test.test_id],
      )
    );

    const answerKey = answers.map((row) => row.correct_answer).join(',');
    const numberOfItems = answers.length;

    db.execute(
      `INSERT INTO test_parts (
         test_part_id,
         test_id,
         competency_id,
         competency_name,
         part_order,
         part_type,
         number_of_items,
         points_per_item,
         answer_key
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        getNextTestPartId(),
        test.test_id,
        null,
        null,
        'Part I',
        'Multiple Choice',
        numberOfItems,
        1,
        answerKey,
      ],
    );
  });
};

const getNextTestPartId = () => {
  const result = db.execute(
    'SELECT COALESCE(MAX(test_part_id), 0) + 1 AS next_test_part_id FROM test_parts'
  );
  return result.rows.item(0).next_test_part_id;
};

export const createTestResult = (testId, studentId, testResultId = null) => {
  const localResultId = generateUuidV4();
  const updatedAt = nowIsoString();
  const params = testResultId == null
    ? [localResultId, testId, studentId, updatedAt]
    : [testResultId, localResultId, testId, studentId, updatedAt];
  const sql = testResultId == null
    ? `INSERT INTO test_results (local_result_id, test_id, student_id, is_synced, created_at, updated_at)
       VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, ?)`
    : `INSERT INTO test_results (test_result_id, local_result_id, test_id, student_id, is_synced, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)`;

  return db.execute(sql, params);
};

export const setClassLastSyncedAt = (classId, teacherId, syncedAt = nowIsoString()) => {
  if (classId == null || teacherId == null) {
    return;
  }

  db.execute(
    `INSERT INTO class_sync_metadata (class_id, teacher_id, last_synced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(class_id)
     DO UPDATE SET
       teacher_id = excluded.teacher_id,
       last_synced_at = excluded.last_synced_at`,
    [classId, teacherId, syncedAt],
  );
};

export const getClassLastSyncedMap = (teacherId) => {
  if (teacherId == null || !hasTable('class_sync_metadata') || !hasColumn('class_sync_metadata', 'teacher_id')) {
    return {};
  }

  const rows = toRowArray(
    db.execute(
      `SELECT class_id, last_synced_at
       FROM class_sync_metadata
       WHERE teacher_id = ?`,
      [teacherId],
    )
  );

  return rows.reduce((map, row) => {
    map[row.class_id] = row.last_synced_at ?? null;
    return map;
  }, {});
};

const ensureRizalMathAssessment = () => {
  const assessmentName = 'Assessment 1';
  const existingAssessment = db.execute(
    `SELECT test_id FROM tests
     WHERE class_id = ? AND test_name = ?
     LIMIT 1`,
    [101, assessmentName],
  );

  if (existingAssessment.rows.length > 0) {
    return;
  }

  const nextTestIdResult = db.execute(
    'SELECT COALESCE(MAX(test_id), 0) + 1 AS next_test_id FROM tests'
  );
  const nextTestId = nextTestIdResult.rows.item(0).next_test_id;

  db.execute(
    `INSERT INTO tests (test_id, class_id, test_name, test_type, test_date, test_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nextTestId, 101, assessmentName, 'Quiz', nowMySQL(), 'Active'],
  );

  const choices = ['A', 'B', 'C', 'D'];
  const answerKey = [];
  for (let itemNumber = 1; itemNumber <= 10; itemNumber++) {
    answerKey.push(choices[Math.floor(Math.random() * choices.length)]);
  }

  db.execute(
    `INSERT INTO test_parts (
       test_part_id,
       test_id,
       competency_id,
       competency_name,
       part_order,
       part_type,
       number_of_items,
       points_per_item,
       answer_key
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [getNextTestPartId(), nextTestId, 1, 'General Numeracy', 'Part I', 'Multiple Choice', 10, 1, answerKey.join(',')],
  );

  const students = toRowArray(db.execute('SELECT student_id FROM students ORDER BY student_id'));
  students.forEach((student) => {
    createTestResult(nextTestId, student.student_id);
  });
};

export const initDatabase = () => {
  try {
    [
      TABLES.users,
      TABLES.classes,
      TABLES.students,
      TABLES.student_enrollments,
      TABLES.tests,
      TABLES.test_parts,
      TABLES.competencies,
      TABLES.test_results,
      TABLES.item_responses,
      TABLES.class_sync_metadata,
      TABLES.session_metadata,
    ].forEach((sql) => db.execute(sql));

    addColumnIfMissing('classes', 'teacher_id', 'INTEGER');
    addColumnIfMissing('classes', 'subject_id', 'INTEGER');
    addColumnIfMissing('classes', 'section_id', 'INTEGER');
    addColumnIfMissing('classes', 'grade_level_id', 'INTEGER');
    addColumnIfMissing('classes', 'grade_level_name', 'TEXT');
    addColumnIfMissing('classes', 'academic_year_id', 'INTEGER');
    addColumnIfMissing('classes', 'academic_year', 'TEXT');

    addColumnIfMissing('students', 'student_lrn', 'TEXT');
    addColumnIfMissing('students', 'gender', 'TEXT');
    addColumnIfMissing('students', 'section_id', 'INTEGER');
    addColumnIfMissing('students', 'section_name', 'TEXT');
    addColumnIfMissing('students', 'grade_level_id', 'INTEGER');
    addColumnIfMissing('students', 'grade_level_name', 'TEXT');
    addColumnIfMissing('students', 'academic_year_id', 'INTEGER');
    addColumnIfMissing('students', 'academic_year', 'TEXT');

    addColumnIfMissing('student_enrollments', 'student_id', 'INTEGER');
    addColumnIfMissing('student_enrollments', 'section_id', 'INTEGER');
    addColumnIfMissing('student_enrollments', 'section_name', 'TEXT');
    addColumnIfMissing('student_enrollments', 'grade_level_id', 'INTEGER');
    addColumnIfMissing('student_enrollments', 'grade_level_name', 'TEXT');
    addColumnIfMissing('student_enrollments', 'academic_year_id', 'INTEGER');
    addColumnIfMissing('student_enrollments', 'academic_year', 'TEXT');

    addColumnIfMissing('tests', 'class_id', 'INTEGER');
    addColumnIfMissing('tests', 'test_type', 'TEXT');
    addColumnIfMissing('tests', 'test_date', 'TEXT');
    addColumnIfMissing('tests', 'grading_period_id', 'INTEGER');
    addColumnIfMissing('tests', 'test_status', 'TEXT');

    addColumnIfMissing('test_parts', 'competency_id', 'INTEGER');
    addColumnIfMissing('test_parts', 'competency_name', 'TEXT');
    addColumnIfMissing('test_parts', 'part_order', 'TEXT');
    addColumnIfMissing('test_parts', 'part_type', 'TEXT');
    addColumnIfMissing('test_parts', 'number_of_items', 'INTEGER');
    addColumnIfMissing('test_parts', 'points_per_item', 'INTEGER');
    addColumnIfMissing('test_parts', 'answer_key', 'TEXT');

    addColumnIfMissing('test_results', 'local_result_id', 'TEXT');
    addColumnIfMissing('test_results', 'raw_answers', 'TEXT');
    addColumnIfMissing('test_results', 'updated_at', 'TEXT');

    addColumnIfMissing('item_responses', 'local_response_id', 'TEXT');
    addColumnIfMissing('item_responses', 'local_result_id', 'TEXT');
    addColumnIfMissing('item_responses', 'updated_at', 'TEXT');

    addColumnIfMissing('class_sync_metadata', 'teacher_id', 'INTEGER');

    addColumnIfMissing('users', 'username', 'TEXT');
    addColumnIfMissing('users', 'password', 'TEXT');

    createIndexIfMissing('idx_classes_teacher_id', 'classes', 'teacher_id');
    createIndexIfMissing('idx_student_enrollments_student_id', 'student_enrollments', 'student_id');
    createIndexIfMissing(
      'idx_student_enrollments_filters',
      'student_enrollments',
      'section_id, grade_level_id, academic_year_id',
    );
    createIndexIfMissing('idx_test_results_sync', 'test_results', 'is_synced');
    createIndexIfMissing('idx_item_responses_sync', 'item_responses', 'is_synced');
    createIndexIfMissing('idx_class_sync_metadata_teacher_id', 'class_sync_metadata', 'teacher_id');
    createUniqueIndexIfMissing(
      'idx_student_enrollments_unique_assignment',
      'student_enrollments',
      'student_id, section_id, grade_level_id, academic_year_id',
    );
    createUniqueIndexIfMissing('idx_test_results_local_result_id', 'test_results', 'local_result_id');
    createUniqueIndexIfMissing('idx_item_responses_local_response_id', 'item_responses', 'local_response_id');
    createUniqueIndexIfMissing(
      'idx_item_responses_local_result_part_item',
      'item_responses',
      'local_result_id, test_part_id, item_number',
    );

    backfillTeacherIds();
    backfillStudentEnrollments();
    backfillLocalResultIds();
    backfillLocalResponseIds();
    backfillItemResponseLocalResultIds();
    migrateLegacyQuestionsToTestParts();

    const adminCheck = db.execute(
      'SELECT user_id FROM users WHERE username = ? LIMIT 1',
      ['admin'],
    );
    if (adminCheck.rows.length === 0) {
      db.execute(
        `INSERT INTO users (user_id, username, password, first_name, last_name)
         VALUES (?, ?, ?, ?, ?)`,
        [999, 'admin', '1234', 'Local', 'Admin'],
      );
    }

    const competencyCheck = db.execute(
      'SELECT competency_id FROM competencies WHERE competency_id = ? LIMIT 1',
      [1],
    );
    if (competencyCheck.rows.length === 0) {
      db.execute(
        `INSERT INTO competencies (competency_id, grade_level_id, subject_id, competency_name)
         VALUES (?, ?, ?, ?)`,
        [1, 7, 1, 'General Numeracy'],
      );
    }

    console.log("OFFLINE DB: Tables Verified.");
  } catch (error) {
    console.error("Init Error:", error);
  }
};

// src/database/db.js

// src/database/db.js

export const seedDemoData = () => {
  try {
    const check = db.execute("SELECT COUNT(*) as count FROM classes");
    if (check.rows.item(0).count > 0) {
      console.log("DB: Already seeded. Skipping...");
      return; 
    }

    db.execute("INSERT INTO users (user_id, first_name, last_name) VALUES (1, 'Senior', 'Architect')");
    db.execute(
      `INSERT INTO competencies (competency_id, grade_level_id, subject_id, competency_name)
       VALUES (?, ?, ?, ?)`,
      [2, 8, 2, 'Scientific Observation'],
    );
    db.execute(
      `INSERT INTO classes (
         class_id,
         teacher_id,
         subject_id,
         subject_name,
         section_id,
         section_name,
         grade_level_id,
         grade_level_name,
         academic_year_id,
         academic_year
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [101, 1, 1, 'Mathematics 7', 701, 'Section Rizal', 7, 'Grade 7', 1, 'SY 2025-2026'],
    );
    db.execute(
      `INSERT INTO classes (
         class_id,
         teacher_id,
         subject_id,
         subject_name,
         section_id,
         section_name,
         grade_level_id,
         grade_level_name,
         academic_year_id,
         academic_year
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [102, 1, 2, 'Science 8', 801, 'Section Bonifacio', 8, 'Grade 8', 1, 'SY 2025-2026'],
    );

    const choices = ['A', 'B', 'C', 'D'];
    [1, 2].forEach(tId => {
      db.execute(
        `INSERT INTO tests (test_id, class_id, test_name, test_type, test_date, test_status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tId, tId === 1 ? 101 : 102, tId === 1 ? 'Midterm Quiz' : 'Final Exam', 'Quiz', nowMySQL(), 'Active'],
      );

      const answerKey = [];
      for (let i = 1; i <= 50; i++) {
        answerKey.push(choices[Math.floor(Math.random() * choices.length)]);
      }

      db.execute(
        `INSERT INTO test_parts (
           test_part_id,
           test_id,
           competency_id,
           competency_name,
           part_order,
           part_type,
           number_of_items,
           points_per_item,
           answer_key
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          getNextTestPartId(),
          tId,
          tId === 1 ? 1 : 2,
          tId === 1 ? 'General Numeracy' : 'Scientific Observation',
          'Part I',
          'Multiple Choice',
          50,
          1,
          answerKey.join(','),
        ],
      );
    });

    const students = [[1, 'Juan'], [2, 'Maria'], [3, 'Jose']];
    students.forEach(s => {
      db.execute(
        `INSERT INTO students (
           student_id,
           student_lrn,
           first_name,
           last_name,
           gender,
           section_id,
           section_name,
           grade_level_id,
           grade_level_name,
           academic_year_id,
           academic_year
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s[0],
          `10000000010${s[0]}`,
          s[1],
          'Dela Cruz',
          s[0] % 2 === 0 ? 'female' : 'male',
          701,
          'Section Rizal',
          7,
          'Grade 7',
          1,
          'SY 2025-2026',
        ],
      );
      db.execute(
        `INSERT OR IGNORE INTO student_enrollments (
           student_id,
           section_id,
           section_name,
           grade_level_id,
           grade_level_name,
           academic_year_id,
           academic_year
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          s[0],
          701,
          'Section Rizal',
          7,
          'Grade 7',
          1,
          'SY 2025-2026',
        ],
      );
      createTestResult(1, s[0], (s[0]*10)+1);
      createTestResult(2, s[0], (s[0]*10)+2);
    });

    console.log("OFFLINE DB: Smart Seed Complete.");
  } catch (err) { console.error("Seed Error:", err); }
};

export const getClassesByTeacher = (teacherId) => {
  try {
    const res = db.execute("SELECT * FROM classes WHERE teacher_id = ?", [teacherId]);
    const data = toRowArray(res);
    console.log("DB FETCH: Found " + data.length + " classes.");
    return data;
  } catch (e) {
    console.error("Fetch Error:", e);
    return [];
  }
};

export const getLocalDataCounts = () => {
  try {
    const classesResult = db.execute('SELECT COUNT(*) AS count FROM classes');
    const studentsResult = db.execute('SELECT COUNT(*) AS count FROM students');
    const testsResult = db.execute('SELECT COUNT(*) AS count FROM tests');
    const testPartsResult = db.execute('SELECT COUNT(*) AS count FROM test_parts');

    return {
      classes: classesResult.rows.item(0)?.count || 0,
      students: studentsResult.rows.item(0)?.count || 0,
      tests: testsResult.rows.item(0)?.count || 0,
      testParts: testPartsResult.rows.item(0)?.count || 0,
    };
  } catch (error) {
    console.error('Local count query error:', error);
    return {
      classes: 0,
      students: 0,
      tests: 0,
      testParts: 0,
    };
  }
};

export const loginUser = (username, password) => {
  try {
    const result = db.execute(
      'SELECT * FROM users WHERE username = ? AND password = ? LIMIT 1',
      [username, password],
    );
    const rows = toRowArray(result);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Login Error:', error);
    throw error;
  }
};

// --- QUERIES ---

export const getAnswerKey = (partId) => {
  const testParts = getTestPartsForTest(partId);
  if (testParts.length > 0) {
    const answerMap = {};
    let globalItemNumber = 1;

    testParts.forEach((part) => {
      parseAnswerKeyArray(part.answer_key).forEach((answer) => {
        answerMap[globalItemNumber] = answer;
        globalItemNumber += 1;
      });
    });

    return answerMap;
  }

  const testPart = resolveTestPartRecord(partId);
  return parseAnswerKey(testPart?.answer_key);
};

export const getStudentRoster = () => {
  const sql = `
    SELECT s.student_id, s.first_name, s.last_name, tr.test_result_id, 
    (SELECT COUNT(*) FROM item_responses ir WHERE ir.local_result_id = tr.local_result_id AND ir.is_correct = 1) as score 
    FROM students s JOIN test_results tr ON s.student_id = tr.student_id
  `;
  const res = db.execute(sql);
  return toRowArray(res);
};

export const getTestPartsForTest = (testId) => {
  try {
    const result = db.execute(
      `SELECT *
       FROM test_parts
       WHERE test_id = ?
       ORDER BY COALESCE(part_order, ''), test_part_id`,
      [testId],
    );
    return toRowArray(result);
  } catch (error) {
    console.error('Test parts query error:', error);
    return [];
  }
};

export const getFlattenedTestItemsForTest = (testId) => {
  const testParts = getTestPartsForTest(testId);
  const flattenedItems = [];
  let globalItemNumber = 1;

  testParts.forEach((part) => {
    const answers = parseAnswerKeyArray(part.answer_key);
    const declaredItems = Number(part.number_of_items || 0);
    const itemCount = Math.max(declaredItems, answers.length);

    for (let itemNumber = 1; itemNumber <= itemCount; itemNumber += 1) {
      flattenedItems.push({
        global_item_number: globalItemNumber,
        test_part_id: part.test_part_id,
        item_number: itemNumber,
        correct_answer: answers[itemNumber - 1] || '?',
        points_per_item: part.points_per_item || 1,
        part_order: part.part_order,
      });
      globalItemNumber += 1;
    }
  });

  return flattenedItems;
};

export const getOrCreateLocalTestResult = (testId, studentId) => {
  const existingRecord = getExistingLocalTestResultRecord(testId, studentId);
  if (existingRecord?.local_result_id) {
    return existingRecord.local_result_id;
  }

  const localResultId = generateUuidV4();
  const timestamp = nowIsoString();
  db.execute(
    `INSERT INTO test_results (
       local_result_id,
       test_id,
       student_id,
       total_score,
       raw_answers,
       is_synced,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, 0, '', 0, ?, ?)`,
    [localResultId, testId, studentId, timestamp, timestamp],
  );

  return localResultId;
};

export const getSavedResponsesForStudent = (testId, studentId) => {
  const testResultRecord = getExistingLocalTestResultRecord(testId, studentId);
  if (!testResultRecord?.local_result_id) {
    return [];
  }

  const result = db.execute(
    `SELECT test_part_id, item_number, is_correct
     FROM item_responses
     WHERE local_result_id = ?`,
    [testResultRecord.local_result_id],
  );

  return toRowArray(result);
};

export const saveItemResponse = (testId, studentId, testPartId, itemNumber, isCorrect) => {
  const localResultId = getOrCreateLocalTestResult(testId, studentId);
  const updatedAt = nowIsoString();

  const existingRow = db.execute(
    `SELECT local_response_id
     FROM item_responses
     WHERE local_result_id = ?
       AND test_part_id = ?
       AND item_number = ?`,
    [localResultId, testPartId, itemNumber],
  );

  const localResponseId = existingRow.rows.length > 0
    ? existingRow.rows.item(0).local_response_id
    : generateUuidV4();

  db.execute(
    `INSERT INTO item_responses (
       local_response_id,
       local_result_id,
       test_part_id,
       item_number,
       is_correct,
       is_synced,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(local_result_id, test_part_id, item_number)
     DO UPDATE SET
       local_response_id = excluded.local_response_id,
       is_correct = excluded.is_correct,
       is_synced = 0,
       updated_at = excluded.updated_at`,
    [localResponseId, localResultId, testPartId, itemNumber, isCorrect ? 1 : 0, updatedAt],
  );

  const scoreResult = db.execute(
    `SELECT COALESCE(SUM(CASE WHEN ir.is_correct = 1 THEN COALESCE(tp.points_per_item, 1) ELSE 0 END), 0) AS total_score
     FROM item_responses ir
     LEFT JOIN test_parts tp ON tp.test_part_id = ir.test_part_id
     WHERE ir.local_result_id = ?`,
    [localResultId],
  );

  const totalScore = scoreResult.rows.item(0)?.total_score || 0;
  const rawAnswers = buildRawAnswersString(localResultId);

  db.execute(
    `UPDATE test_results
     SET total_score = ?,
         raw_answers = ?,
         is_synced = 0,
         updated_at = ?
     WHERE local_result_id = ?`,
    [totalScore, rawAnswers, updatedAt, localResultId],
  );

  return {
    localResultId,
    localResponseId,
    totalScore,
    rawAnswers,
  };
};


export const saveItemGrade = (resId, partId, itemNum, isCorrect) => {
  const testResultRecord = getTestResultRecordById(resId);
  if (!testResultRecord) {
    throw new Error('Missing local test result record for item grading.');
  }

  const testPart = resolveTestPartRecord(partId);
  if (!testPart) {
    throw new Error('Missing test part record for item grading.');
  }

  return saveItemResponse(
    testResultRecord.test_id,
    testResultRecord.student_id,
    testPart.test_part_id,
    itemNum,
    isCorrect,
  );
};

export const getSavedGrades = (resId) => {
  const localResultId = getLocalResultIdByTestResultId(resId);
  if (!localResultId) {
    return {};
  }

  const res = db.execute(
    "SELECT item_number, is_correct FROM item_responses WHERE local_result_id = ?",
    [localResultId],
  );
  const map = {};
  for (let i = 0; i < res.rows.length; i++) {
    map[res.rows.item(i).item_number] = res.rows.item(i).is_correct;
  }
  return map;
};

export const getLeastMasteredSkills = () => {
  const res = db.execute("SELECT item_number, COUNT(*) as error_count FROM item_responses WHERE is_correct = 0 GROUP BY item_number ORDER BY error_count DESC LIMIT 5");
  return toRowArray(res);
};



export const getClassStats = (testId) => {
  try {
    const avgRes = db.execute(
      `SELECT COALESCE(AVG(tr.total_score), 0) AS average
       FROM test_results tr
       WHERE tr.test_id = ?
         AND EXISTS (
           SELECT 1
           FROM item_responses ir
           WHERE ir.local_result_id = tr.local_result_id
         )`,
      [testId],
    );

    const gradedRes = db.execute(
      `SELECT COUNT(DISTINCT tr.local_result_id) AS gradedCount
       FROM test_results tr
       WHERE tr.test_id = ?
         AND EXISTS (
           SELECT 1
           FROM item_responses ir
           WHERE ir.local_result_id = tr.local_result_id
         )`,
      [testId],
    );

    const topRes = db.execute(
      `SELECT s.first_name, COALESCE(tr.total_score, 0) AS high_score
       FROM test_results tr
       JOIN students s ON tr.student_id = s.student_id
       WHERE tr.test_id = ?
         AND EXISTS (
           SELECT 1
           FROM item_responses ir
           WHERE ir.local_result_id = tr.local_result_id
         )
       ORDER BY high_score DESC, tr.updated_at DESC, tr.test_result_id DESC
       LIMIT 1`,
      [testId],
    );

    return {
      average: avgRes.rows.item(0).average || 0,
      gradedCount: gradedRes.rows.item(0).gradedCount || 0,
      topStudent: topRes.rows.length > 0 ? topRes.rows.item(0).first_name : 'N/A'
    };
  } catch (e) {
    return { average: 0, gradedCount: 0, topStudent: 'N/A' };
  }
};


// 2. Get all tests for a specific class
export const getTestsByClass = (classId) => {
  try {
    const res = db.execute(
      `SELECT t.*,
              COALESCE(SUM(tp.number_of_items), 0) AS total_items
       FROM tests t
       LEFT JOIN test_parts tp ON tp.test_id = t.test_id
       WHERE t.class_id = ?
       GROUP BY t.test_id
       ORDER BY t.test_date, t.test_id`,
      [classId],
    );
    return toRowArray(res);
  } catch (e) {
    throw e;
  }
};

export const getRosterForTest = (testId, classId) => {
  try {
    const selectedTestResult = db.execute(
      `SELECT test_id, class_id
       FROM tests
       WHERE test_id = ?
       LIMIT 1`,
      [testId],
    );

    if (selectedTestResult.rows.length === 0) {
      return [];
    }

    const selectedTest = selectedTestResult.rows.item(0);
    const resolvedClassId = classId ?? selectedTest.class_id;
    const selectedClass = getSelectedClassRecord(resolvedClassId);
    if (!selectedClass) {
      return [];
    }

    const counts = getRosterMatchCounts(selectedClass);

    console.log('ROSTER DEBUG: selected class filters =', {
      class_id: selectedClass.class_id,
      subject_name: selectedClass.subject_name ?? null,
      section_id: selectedClass.section_id,
      section_name: selectedClass.section_name ?? null,
      grade_level_id: selectedClass.grade_level_id,
      grade_level_name: selectedClass.grade_level_name ?? null,
      academic_year_id: selectedClass.academic_year_id ?? null,
      academic_year: selectedClass.academic_year ?? null,
    });
    console.log('ROSTER DEBUG: total students in students table =', counts.totalStudents);
    console.log('ROSTER DEBUG: total rows in student_enrollments table =', counts.totalEnrollments);

    const sql = `
      SELECT
        s.student_id,
        s.first_name,
        s.last_name,
        tr.test_result_id,
        tr.local_result_id,
        COALESCE(tr.total_score, 0) AS score,
        CASE
          WHEN tr.local_result_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM item_responses ir
              WHERE ir.local_result_id = tr.local_result_id
            )
          THEN 1
          ELSE 0
        END AS is_checked
      FROM students s
      INNER JOIN student_enrollments se ON se.student_id = s.student_id
      LEFT JOIN (
        SELECT tr1.test_result_id, tr1.local_result_id, tr1.student_id, tr1.total_score
        FROM test_results tr1
        INNER JOIN (
          SELECT student_id, MAX(test_result_id) AS latest_test_result_id
          FROM test_results
          WHERE test_id = ?
          GROUP BY student_id
        ) latest
          ON latest.latest_test_result_id = tr1.test_result_id
      ) tr ON tr.student_id = s.student_id
      WHERE se.section_id = ?
        AND se.grade_level_id = ?
        AND se.academic_year_id = ?
      ORDER BY s.last_name, s.first_name, s.student_id
    `;
    const res = db.execute(sql, [
      testId,
      selectedClass.section_id,
      selectedClass.grade_level_id,
      selectedClass.academic_year_id,
    ]);
    const roster = toRowArray(res);
    console.log('ROSTER DEBUG: roster found count =', roster.length);

    if (roster.length === 0) {
      logRosterFallbackDiagnostics(selectedClass);
    }

    return roster;
  } catch (e) {
    console.error("Query Error:", e);
    return [];
  }
};

export const getRosterDebugInfo = (classId) => {
  try {
    const selectedClass = getSelectedClassRecord(classId);
    if (!selectedClass) {
      return null;
    }

    const counts = getRosterMatchCounts(selectedClass);

    return {
      class_id: selectedClass.class_id,
      section_id: selectedClass.section_id,
      grade_level_id: selectedClass.grade_level_id,
      academic_year_id: selectedClass.academic_year_id,
      localStudentsFound: counts.strictMatches,
      localEnrollmentsFound: counts.strictEnrollmentRows,
    };
  } catch (error) {
    console.error('ROSTER DEBUG INFO ERROR:', error);
    return null;
  }
};

export const getSelectedTestSyncStatus = (testId, classId) => {
  try {
    if (testId == null || classId == null) {
      return {
        totalStudents: 0,
        checkedStudents: 0,
        syncedStudents: 0,
        unsyncedStudents: 0,
        uncheckedStudents: 0,
      };
    }

    const selectedClass = getSelectedClassRecord(classId);
    if (!selectedClass) {
      return {
        totalStudents: 0,
        checkedStudents: 0,
        syncedStudents: 0,
        unsyncedStudents: 0,
        uncheckedStudents: 0,
      };
    }

    const filterParams = [
      selectedClass.section_id,
      selectedClass.grade_level_id,
      selectedClass.academic_year_id,
    ];

    const totalStudentsResult = db.execute(
      `SELECT COUNT(DISTINCT s.student_id) AS count
       FROM students s
       JOIN student_enrollments se ON se.student_id = s.student_id
       WHERE se.section_id = ?
         AND se.grade_level_id = ?
         AND se.academic_year_id = ?`,
      filterParams,
    );

    const latestTestResultsSubquery = `
      SELECT tr1.student_id, tr1.is_synced
      FROM test_results tr1
      INNER JOIN (
        SELECT student_id, MAX(test_result_id) AS latest_test_result_id
        FROM test_results
        WHERE test_id = ?
        GROUP BY student_id
      ) latest
        ON latest.latest_test_result_id = tr1.test_result_id
    `;

    const checkedStudentsResult = db.execute(
      `SELECT COUNT(DISTINCT tr.student_id) AS count
       FROM (${latestTestResultsSubquery}) tr
       JOIN student_enrollments se ON se.student_id = tr.student_id
       WHERE se.section_id = ?
         AND se.grade_level_id = ?
         AND se.academic_year_id = ?`,
      [testId, ...filterParams],
    );

    const syncedStudentsResult = db.execute(
      `SELECT COUNT(DISTINCT tr.student_id) AS count
       FROM (${latestTestResultsSubquery}) tr
       JOIN student_enrollments se ON se.student_id = tr.student_id
       WHERE tr.is_synced = 1
         AND se.section_id = ?
         AND se.grade_level_id = ?
         AND se.academic_year_id = ?`,
      [testId, ...filterParams],
    );

    const unsyncedStudentsResult = db.execute(
      `SELECT COUNT(DISTINCT tr.student_id) AS count
       FROM (${latestTestResultsSubquery}) tr
       JOIN student_enrollments se ON se.student_id = tr.student_id
       WHERE tr.is_synced = 0
         AND se.section_id = ?
         AND se.grade_level_id = ?
         AND se.academic_year_id = ?`,
      [testId, ...filterParams],
    );

    const totalStudents = totalStudentsResult.rows.item(0)?.count || 0;
    const checkedStudents = checkedStudentsResult.rows.item(0)?.count || 0;
    const syncedStudents = syncedStudentsResult.rows.item(0)?.count || 0;
    const unsyncedStudents = unsyncedStudentsResult.rows.item(0)?.count || 0;

    return {
      totalStudents,
      checkedStudents,
      syncedStudents,
      unsyncedStudents,
      uncheckedStudents: Math.max(0, totalStudents - checkedStudents),
    };
  } catch (error) {
    console.error('TEST SYNC STATUS ERROR:', error);
    return {
      totalStudents: 0,
      checkedStudents: 0,
      syncedStudents: 0,
      unsyncedStudents: 0,
      uncheckedStudents: 0,
    };
  }
};

export const getAssessmentAnalytics = (testId, classId) => {
  try {
    if (testId == null || classId == null) {
      return { competencyPerformance: [], itemAnalysis: [] };
    }

    const selectedClass = getSelectedClassRecord(classId);
    if (!selectedClass) {
      return { competencyPerformance: [], itemAnalysis: [] };
    }

    const testParts = getTestPartsForTest(testId);
    const partLookup = new Map(
      testParts.map((part) => [part.test_part_id, part]),
    );
    const testItems = getFlattenedTestItemsForTest(testId).map((item) => {
      const part = partLookup.get(item.test_part_id) || {};

      return {
        ...item,
        competency_name: part.competency_name || null,
      };
    });

    if (testItems.length === 0) {
      return { competencyPerformance: [], itemAnalysis: [] };
    }

    const latestResults = db.execute(
      `SELECT tr1.local_result_id
       FROM test_results tr1
       INNER JOIN (
         SELECT student_id, MAX(test_result_id) AS latest_test_result_id
         FROM test_results
         WHERE test_id = ?
         GROUP BY student_id
       ) latest
         ON latest.latest_test_result_id = tr1.test_result_id
       JOIN student_enrollments se ON se.student_id = tr1.student_id
       WHERE se.section_id = ?
         AND se.grade_level_id = ?
         AND se.academic_year_id = ?`,
      [
        testId,
        selectedClass.section_id,
        selectedClass.grade_level_id,
        selectedClass.academic_year_id,
      ],
    );

    const localResultIds = toRowArray(latestResults)
      .map((row) => row.local_result_id)
      .filter(Boolean);
    const checkedStudentCount = localResultIds.length;

    if (checkedStudentCount === 0) {
      return {
        competencyPerformance: buildCompetencyRows(testItems, new Map(), 0),
        itemAnalysis: testItems.map((item) => ({
          itemNumber: item.global_item_number,
          label: `Item ${item.global_item_number}`,
          percent: 0,
          correctCount: 0,
          checkedCount: 0,
        })),
      };
    }

    const placeholders = localResultIds.map(() => '?').join(', ');
    const responseResult = db.execute(
      `SELECT local_result_id, test_part_id, item_number, is_correct
       FROM item_responses
       WHERE local_result_id IN (${placeholders})`,
      localResultIds,
    );

    const responseLookup = new Map();
    toRowArray(responseResult).forEach((response) => {
      responseLookup.set(
        `${response.local_result_id}:${response.test_part_id}:${response.item_number}`,
        Number(response.is_correct) === 1,
      );
    });

    return {
      competencyPerformance: buildCompetencyRows(testItems, responseLookup, checkedStudentCount, localResultIds),
      itemAnalysis: testItems.map((item) => {
        const correctCount = localResultIds.reduce((total, localResultId) => (
          responseLookup.get(`${localResultId}:${item.test_part_id}:${item.item_number}`) ? total + 1 : total
        ), 0);

        return {
          itemNumber: item.global_item_number,
          label: `Item ${item.global_item_number}`,
          percent: Math.round((correctCount / checkedStudentCount) * 100),
          correctCount,
          checkedCount: checkedStudentCount,
        };
      }),
    };
  } catch (error) {
    console.error('ASSESSMENT ANALYTICS ERROR:', error);
    return { competencyPerformance: [], itemAnalysis: [] };
  }
};

const buildCompetencyRows = (testItems, responseLookup, checkedStudentCount, localResultIds = []) => {
  const competencyMap = new Map();

  testItems.forEach((item) => {
    const competencyName = item.competency_name;
    if (!competencyName) {
      return;
    }

    if (!competencyMap.has(competencyName)) {
      competencyMap.set(competencyName, {
        label: competencyName,
        itemCount: 0,
        correctCount: 0,
        checkedCount: checkedStudentCount,
      });
    }

    const row = competencyMap.get(competencyName);
    row.itemCount += 1;
    row.correctCount += localResultIds.reduce((total, localResultId) => (
      responseLookup.get(`${localResultId}:${item.test_part_id}:${item.item_number}`) ? total + 1 : total
    ), 0);
  });

  return Array.from(competencyMap.values()).map((row) => {
    const possibleResponses = row.itemCount * checkedStudentCount;
    return {
      ...row,
      percent: possibleResponses > 0 ? Math.round((row.correctCount / possibleResponses) * 100) : 0,
    };
  });
};
// Idagdag o i-verify ito sa src/database/db.js
export const resetAllScores = () => {
  try {
    db.execute("DELETE FROM item_responses");
    db.execute(
      `UPDATE test_results
       SET total_score = 0,
           raw_answers = '',
           is_synced = 0,
           updated_at = ?`,
      [nowIsoString()],
    );
    console.log("OFFLINE DB: All scores cleared.");
  } catch (e) {
    console.error(e);
  }
};

export const clearLocalTestingData = () => {
  try {
    db.transaction((tx) => {
      tx.execute('DELETE FROM item_responses');
      tx.execute('DELETE FROM test_results');
      tx.execute('DELETE FROM test_parts');
      tx.execute('DELETE FROM tests');
      tx.execute('DELETE FROM student_enrollments');
      tx.execute('DELETE FROM students');
      tx.execute('DELETE FROM classes');
      tx.execute('DELETE FROM competencies');
      tx.execute('DELETE FROM class_sync_metadata');
    });

    console.log('OFFLINE DB: Local testing data cleared.');
    return { success: true };
  } catch (error) {
    console.error('CLEAR LOCAL DATA ERROR:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const mapDownloadClasses = (rows = []) =>
  rows.map((row) => ({
    class_id: getPayloadValue(row, ['classId', 'class_id']),
    teacher_id: getPayloadValue(row, ['teacherId', 'teacher_id']),
    subject_id: getPayloadValue(row, ['subjectId', 'subject_id']),
    subject_name: getPayloadValue(row, ['subjectName', 'subject_name']),
    section_id: getPayloadValue(row, ['sectionId', 'section_id']),
    section_name: getPayloadValue(row, ['sectionName', 'section_name']),
    grade_level_id: getPayloadValue(row, ['gradeLevelId', 'grade_level_id']),
    grade_level_name: getPayloadValue(row, ['gradeLevelName', 'grade_level_name']),
    academic_year_id: getPayloadValue(row, ['academicYearId', 'academic_year_id', 'academicYearID']),
    academic_year: getPayloadValue(row, ['academicYear', 'academic_year']),
  }));

const mapDownloadStudents = (rows = []) =>
  rows.map((row) => ({
    student_id: getPayloadValue(row, ['studentId', 'student_id']),
    student_lrn: getPayloadValue(row, ['studentLrn', 'student_lrn']),
    first_name: getPayloadValue(row, ['firstName', 'first_name']),
    last_name: getPayloadValue(row, ['lastName', 'last_name']),
    gender: getPayloadValue(row, ['gender']),
    section_id: getPayloadValue(row, ['sectionId', 'section_id']),
    section_name: getPayloadValue(row, ['sectionName', 'section_name']),
    grade_level_id: getPayloadValue(row, ['gradeLevelId', 'grade_level_id']),
    grade_level_name: getPayloadValue(row, ['gradeLevelName', 'grade_level_name']),
    academic_year_id: getPayloadValue(row, ['academicYearId', 'academic_year_id', 'academicYearID']),
    academic_year: getPayloadValue(row, ['academicYear', 'academic_year']),
  }));

const mapDownloadStudentEnrollments = (rows = []) =>
  Array.from(
    rows.reduce((map, row) => {
      const studentId = getPayloadValue(row, ['studentId', 'student_id']);
      const sectionId = getPayloadValue(row, ['sectionId', 'section_id']);
      const gradeLevelId = getPayloadValue(row, ['gradeLevelId', 'grade_level_id']);
      const academicYearId = getPayloadValue(row, ['academicYearId', 'academic_year_id', 'academicYearID']);

      if (
        studentId == null
        || sectionId == null
        || gradeLevelId == null
        || academicYearId == null
      ) {
        return map;
      }

      const key = [
        studentId,
        sectionId,
        gradeLevelId,
        academicYearId,
      ].join('|');

      map.set(key, {
        student_id: studentId,
        section_id: sectionId,
        section_name: getPayloadValue(row, ['sectionName', 'section_name']),
        grade_level_id: gradeLevelId,
        grade_level_name: getPayloadValue(row, ['gradeLevelName', 'grade_level_name']),
        academic_year_id: academicYearId,
        academic_year: getPayloadValue(row, ['academicYear', 'academic_year']),
      });

      return map;
    }, new Map()).values(),
  );

const mapDownloadTests = (rows = []) =>
  rows.map((row) => ({
    test_id: getPayloadValue(row, ['testId', 'test_id']),
    class_id: getPayloadValue(row, ['classId', 'class_id']),
    test_name: getPayloadValue(row, ['testName', 'test_name']),
    test_type: getPayloadValue(row, ['testType', 'test_type']),
    test_date: getPayloadValue(row, ['testDate', 'test_date']),
    grading_period_id: getPayloadValue(row, ['gradingPeriodId', 'grading_period_id']),
    test_status: getPayloadValue(row, ['testStatus', 'test_status']),
  }));

const mapDownloadTestParts = (rows = []) =>
  rows.map((row) => ({
    test_part_id: getPayloadValue(row, ['testPartId', 'test_part_id']),
    test_id: getPayloadValue(row, ['testId', 'test_id']),
    competency_id: getPayloadValue(row, ['competencyId', 'competency_id']),
    competency_name: getPayloadValue(row, ['competencyName', 'competency_name']),
    part_order: getPayloadValue(row, ['partOrder', 'part_order']),
    part_type: getPayloadValue(row, ['partType', 'part_type']),
    number_of_items: getPayloadValue(row, ['numberOfItems', 'number_of_items']),
    points_per_item: getPayloadValue(row, ['pointsPerItem', 'points_per_item']),
    answer_key: getPayloadValue(row, ['answerKey', 'answer_key']),
  }));

const mapDownloadCompetencies = (rows = []) =>
  rows.map((row) => ({
    competency_id: getPayloadValue(row, ['competencyId', 'competency_id']),
    grade_level_id: getPayloadValue(row, ['gradeLevelId', 'grade_level_id']),
    subject_id: getPayloadValue(row, ['subjectId', 'subject_id']),
    competency_name: getPayloadValue(row, ['competencyName', 'competency_name']),
  }));

const mapDownloadBackendTestResults = (rows = []) =>
  rows
    .map((row) => {
      const testResultId = getPayloadValue(row, ['testResultId', 'test_result_id']);
      if (testResultId == null) {
        return null;
      }

      const checkedAt = getPayloadValue(row, ['checkedAt', 'checked_at']);

      return {
        local_result_id: buildBackendLocalResultId(testResultId),
        test_id: getPayloadValue(row, ['testId', 'test_id']),
        student_id: getPayloadValue(row, ['studentId', 'student_id']),
        total_score: getPayloadValue(row, ['totalScore', 'total_score'], 0),
        raw_answers: getPayloadValue(row, ['rawAnswers', 'raw_answers'], ''),
        is_synced: 1,
        created_at: checkedAt ?? nowIsoString(),
        updated_at: checkedAt ?? nowIsoString(),
      };
    })
    .filter(Boolean);

const mapDownloadBackendItemResponses = (rows = []) =>
  rows
    .map((row) => {
      const itemResultId = getPayloadValue(row, ['itemResultId', 'item_result_id']);
      const testResultId = getPayloadValue(row, ['testResultId', 'test_result_id']);
      if (itemResultId == null || testResultId == null) {
        return null;
      }

      const isCorrectValue = getPayloadValue(row, ['isCorrect', 'is_correct'], false);

      return {
        local_response_id: buildBackendLocalResponseId(itemResultId),
        local_result_id: buildBackendLocalResultId(testResultId),
        test_part_id: getPayloadValue(row, ['testPartId', 'test_part_id']),
        item_number: getPayloadValue(row, ['itemNumber', 'item_number']),
        is_correct: isCorrectValue === true || isCorrectValue === 1 ? 1 : 0,
        is_synced: 1,
        updated_at: nowIsoString(),
      };
    })
    .filter(Boolean);

const restoreDownloadedBackendResults = (backendTestResults = [], backendItemResponses = []) => {
  const restoredLocalResultIds = new Set();
  let restoredTestResultsCount = 0;
  let restoredItemResponsesCount = 0;

  backendTestResults.forEach((row) => {
    const conflict = db.execute(
      `SELECT local_result_id
       FROM test_results
       WHERE test_id = ?
         AND student_id = ?
         AND is_synced = 0
         AND local_result_id != ?
       LIMIT 1`,
      [row.test_id, row.student_id, row.local_result_id],
    );

    if (conflict.rows.length > 0) {
      console.log('SYNC RESTORE: skipped backend test result because unsynced local row exists.', {
        test_id: row.test_id,
        student_id: row.student_id,
        backend_local_result_id: row.local_result_id,
        conflicting_local_result_id: conflict.rows.item(0).local_result_id,
      });
      return;
    }

    upsertRowOnConflict('test_results', row, ['local_result_id']);
    restoredLocalResultIds.add(row.local_result_id);
    restoredTestResultsCount += 1;
  });

  backendItemResponses.forEach((row) => {
    if (!restoredLocalResultIds.has(row.local_result_id)) {
      return;
    }

    upsertRowOnConflict('item_responses', row, ['local_result_id', 'test_part_id', 'item_number']);
    restoredItemResponsesCount += 1;
  });

  return {
    restoredTestResultsCount,
    restoredItemResponsesCount,
  };
};

const normalizeDownloadPayload = (payload = {}) => {
  const backendTestResultsRows = payload.testResults ?? payload.test_results;
  const backendItemResponsesRows = payload.itemResponses ?? payload.item_responses;

  const normalized = {
    classes: mapDownloadClasses(payload.classes),
    students: mapDownloadStudents(payload.students),
    student_enrollments: mapDownloadStudentEnrollments(payload.students),
    tests: mapDownloadTests(payload.tests),
    test_parts: mapDownloadTestParts(payload.testParts),
    competencies: mapDownloadCompetencies(payload.competencies),
    backend_test_results: mapDownloadBackendTestResults(backendTestResultsRows),
    backend_item_responses: mapDownloadBackendItemResponses(backendItemResponsesRows),
  };

  const summary = {
    classes: normalized.classes.length,
    students: normalized.students.length,
    studentEnrollments: normalized.student_enrollments.length,
    tests: normalized.tests.length,
    testParts: normalized.test_parts.length,
    competencies: normalized.competencies.length,
    restoredTestResults: normalized.backend_test_results.length,
    restoredItemResponses: normalized.backend_item_responses.length,
  };

  return { normalized, summary };
};

export const saveDownloadedData = (payload = {}) => {
  try {
    const backendTestResultsRows = payload.testResults ?? payload.test_results;
    const backendItemResponsesRows = payload.itemResponses ?? payload.item_responses;
    const rawPayloadSummary = {
      classes: Array.isArray(payload.classes) ? payload.classes.length : 0,
      students: Array.isArray(payload.students) ? payload.students.length : 0,
      tests: Array.isArray(payload.tests) ? payload.tests.length : 0,
      testParts: Array.isArray(payload.testParts) ? payload.testParts.length : 0,
      competencies: Array.isArray(payload.competencies) ? payload.competencies.length : 0,
      testResults: Array.isArray(backendTestResultsRows) ? backendTestResultsRows.length : 0,
      itemResponses: Array.isArray(backendItemResponsesRows) ? backendItemResponsesRows.length : 0,
    };
    console.log('SYNC: raw payload counts =', rawPayloadSummary);
    console.log('SYNC: first class payload =', Array.isArray(payload.classes) && payload.classes.length > 0 ? payload.classes[0] : null);
    console.log('SYNC: first student payload =', Array.isArray(payload.students) && payload.students.length > 0 ? payload.students[0] : null);

    const { normalized, summary } = normalizeDownloadPayload(payload);

    replaceRows('classes', normalized.classes);
    replaceRows('students', normalized.students);
    replaceRows('student_enrollments', normalized.student_enrollments);
    replaceRows('tests', normalized.tests);
    replaceRows('test_parts', normalized.test_parts);
    replaceRows('competencies', normalized.competencies);
    backfillStudentEnrollments();
    const restoredSummary = restoreDownloadedBackendResults(
      normalized.backend_test_results,
      normalized.backend_item_responses,
    );

    const savedStudentsPreview = toRowArray(
      db.execute(
        `SELECT
           student_id,
           first_name,
           last_name,
           section_id,
           section_name,
           grade_level_id,
           grade_level_name,
           academic_year_id,
           academic_year
         FROM students
         ORDER BY student_id
         LIMIT 5`,
      ),
    );
    const savedEnrollmentPreview = toRowArray(
      db.execute(
        `SELECT
           student_id,
           section_id,
           section_name,
           grade_level_id,
           grade_level_name,
           academic_year_id,
           academic_year
         FROM student_enrollments
         ORDER BY student_id, enrollment_id
         LIMIT 5`,
      ),
    );

    console.log('SYNC: saved classes count =', summary.classes);
    console.log('SYNC: saved students count =', summary.students);
    console.log('SYNC: saved student_enrollments count =', summary.studentEnrollments);
    console.log('SYNC: saved tests count =', summary.tests);
    console.log('SYNC: saved test_parts count =', summary.testParts);
    console.log('SYNC: saved competencies count =', summary.competencies);
    console.log('SYNC: restored testResults count =', restoredSummary.restoredTestResultsCount);
    console.log('SYNC: restored itemResponses count =', restoredSummary.restoredItemResponsesCount);
    logPreviewRows('SYNC: first 5 saved students', savedStudentsPreview, [
      'student_id',
      'first_name',
      'last_name',
      'section_id',
      'section_name',
      'grade_level_id',
      'grade_level_name',
      'academic_year_id',
      'academic_year',
    ]);
    logPreviewRows('SYNC: first 5 saved student_enrollments', savedEnrollmentPreview, [
      'student_id',
      'section_id',
      'section_name',
      'grade_level_id',
      'grade_level_name',
      'academic_year_id',
      'academic_year',
    ]);
    console.log('SYNC: Downloaded data saved locally.', summary);
    return { success: true, summary };
  } catch (error) {
    console.error('SYNC SAVE ERROR:', error);
    return { success: false, error: String(error) };
  }
};

export const downloadSyncData = async (teacherId) => {
  try {
    const downloadUrl = getSyncDownloadUrl(teacherId);
    console.log('SYNC: Download URL:', downloadUrl);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const responseBody = await response.json();
    if (!responseBody?.success) {
      throw new Error(responseBody?.message || 'Download sync request was not successful.');
    }

    const payload = responseBody?.data || {};
    const backendTestResultsRows = payload.testResults ?? payload.test_results;
    const backendItemResponsesRows = payload.itemResponses ?? payload.item_responses;
    console.log('SYNC: raw payload classes count =', Array.isArray(payload.classes) ? payload.classes.length : 0);
    console.log('SYNC: raw payload students count =', Array.isArray(payload.students) ? payload.students.length : 0);
    console.log('SYNC: raw payload tests count =', Array.isArray(payload.tests) ? payload.tests.length : 0);
    console.log('SYNC: raw payload testParts count =', Array.isArray(payload.testParts) ? payload.testParts.length : 0);
    console.log('SYNC: raw payload competencies count =', Array.isArray(payload.competencies) ? payload.competencies.length : 0);
    console.log('SYNC: raw payload testResults count =', Array.isArray(backendTestResultsRows) ? backendTestResultsRows.length : 0);
    console.log('SYNC: raw payload itemResponses count =', Array.isArray(backendItemResponsesRows) ? backendItemResponsesRows.length : 0);
    console.log('SYNC: first class payload object =', Array.isArray(payload.classes) && payload.classes.length > 0 ? payload.classes[0] : null);
    console.log('SYNC: first student payload object =', Array.isArray(payload.students) && payload.students.length > 0 ? payload.students[0] : null);

    if (Array.isArray(payload.students) && payload.students.length === 0) {
      console.error('SYNC: backend /api/sync/download/{teacherId} returned 0 students. Mobile cannot infer missing student rows.');
    }

    const saveResult = saveDownloadedData(payload);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save downloaded data');
    }

    console.log('SYNC: Download summary counts:', saveResult.summary);

    return {
      success: true,
      data: payload,
      summary: saveResult.summary,
      message: responseBody?.message || 'Download sync completed successfully.',
    };
  } catch (error) {
    console.error('SYNC DOWNLOAD ERROR:', error);
    return { success: false, error: String(error) };
  }
};

export const collectUnsyncedResults = (teacherId) => {
  try {
    if (teacherId == null) {
      return {
        success: true,
        payload: { test_results: [], item_responses: [] },
      };
    }

    const testResults = toRowArray(
      db.execute(`
        SELECT DISTINCT tr.*
        FROM test_results tr
        JOIN tests t ON t.test_id = tr.test_id
        JOIN classes c ON c.class_id = t.class_id
        LEFT JOIN item_responses ir ON ir.local_result_id = tr.local_result_id
        WHERE c.teacher_id = ?
          AND (tr.is_synced = 0 OR ir.is_synced = 0)
        ORDER BY tr.test_result_id
      `, [teacherId])
    );

    const itemResponses = toRowArray(
      db.execute(
        `SELECT ir.*
         FROM item_responses ir
         JOIN test_results tr ON tr.local_result_id = ir.local_result_id
         JOIN tests t ON t.test_id = tr.test_id
         JOIN classes c ON c.class_id = t.class_id
         WHERE c.teacher_id = ?
           AND ir.is_synced = 0
         ORDER BY ir.response_id`,
        [teacherId],
      )
    );

    return {
      success: true,
      payload: {
        test_results: testResults,
        item_responses: itemResponses,
      },
    };
  } catch (error) {
    console.error('SYNC COLLECT ERROR:', error);
    return { success: false, error: String(error) };
  }
};

const markUploadedResultsAsSynced = (payload) => {
  const syncedTestResultIds = new Set(
    (payload.test_results || []).map(result => result.test_result_id)
  );

  syncedTestResultIds.forEach((testResultId) => {
    db.execute('UPDATE test_results SET is_synced = 1 WHERE test_result_id = ?', [testResultId]);
  });

  (payload.item_responses || []).forEach((item) => {
    db.execute(
      `UPDATE item_responses
       SET is_synced = 1
       WHERE local_response_id = ?`,
      [item.local_response_id],
    );
  });
};

export const uploadUnsyncedResults = async (teacherId, testId) => {
  if (testId == null) {
    return {
      success: false,
      error: 'Select a test first before uploading current results.',
    };
  }

  const result = await syncToServer(teacherId, testId);
  if (!result.success) {
    console.error('SYNC UPLOAD ERROR:', result.error);
    return { success: false, inProgress: result.inProgress, error: result.error };
  }

  if (result.noData) {
    return {
      success: true,
      uploaded: false,
      noData: true,
      message: 'No unsynced checked results for this test.',
      response: result.response,
      summary: result.summary,
    };
  }

  const uploaded = (result.summary?.uploadedResults || 0) > 0 || (result.summary?.uploadedItems || 0) > 0;
  return {
    success: true,
    uploaded,
    response: result.response,
    summary: result.summary,
  };
};

export const uploadAllUnsyncedResults = async (teacherId) => {
  const result = await syncAllUnsyncedToServer(teacherId);
  if (!result.success) {
    console.error('SYNC UPLOAD ALL ERROR:', result.error);
    return { success: false, inProgress: result.inProgress, error: result.error };
  }

  return {
    success: true,
    noData: result.noData,
    uploaded: (result.summary?.uploadedResults || 0) > 0 || (result.summary?.uploadedItems || 0) > 0,
    summary: result.summary,
  };
};
export const debugItemResponses = () => {
  const result = db.execute(`
    SELECT local_response_id, local_result_id, test_part_id, item_number, is_correct, is_synced, updated_at
    FROM item_responses
    WHERE item_number = 1
  `);

  const rows = result.rows?._array || [];

  console.log("DEBUG item_responses:", rows);
};
