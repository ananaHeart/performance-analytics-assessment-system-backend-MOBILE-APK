import type {Transaction} from 'react-native-quick-sqlite';

import {V2_CONTRACT_VERSION, type V2DownloadPayload} from './contracts';
import {getV2Database, nowIso, rowsToArray, withV2Transaction} from './database';

type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;

const assertIdentifier = (identifier: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }

  return identifier;
};

const upsert = (
  transaction: Transaction,
  tableName: string,
  row: SqlRow,
  conflictColumns: string[],
): void => {
  const table = assertIdentifier(tableName);
  const columns = Object.keys(row).map(assertIdentifier);
  const conflicts = conflictColumns.map(assertIdentifier);
  const updateColumns = columns.filter(column => !conflicts.includes(column));
  const placeholders = columns.map(() => '?').join(', ');
  const conflictSql = conflicts.join(', ');
  const updateSql = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map(column => `${column} = excluded.${column}`).join(', ')}`
    : 'DO NOTHING';

  transaction.execute(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(${conflictSql}) ${updateSql}`,
    columns.map(column => row[column]),
  );
};

const assertDownloadPayload = (payload: V2DownloadPayload): void => {
  if (payload.contractVersion !== V2_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported V2 contract version ${payload.contractVersion}; expected ${V2_CONTRACT_VERSION}.`,
    );
  }

  if (!payload.generatedAt || !payload.user?.userId) {
    throw new Error('V2 download payload is missing generatedAt or the authenticated user.');
  }
};

export const saveV2DownloadPayload = async (payload: V2DownloadPayload): Promise<void> => {
  assertDownloadPayload(payload);
  const downloadedAt = nowIso();

  await withV2Transaction(transaction => {
    upsert(
      transaction,
      'users',
      {
        user_id: payload.user.userId,
        school_id: payload.user.schoolId,
        email: payload.user.email,
        role: payload.user.role,
        status: payload.user.status,
      },
      ['user_id'],
    );

    payload.classes.forEach(item => {
      upsert(
        transaction,
        'classes',
        {
          class_id: item.classId,
          academic_year_id: item.academicYearId,
          year_name: item.yearName,
          grade_level_id: item.gradeLevelId,
          grade_level_name: item.gradeLevelName,
          section_id: item.sectionId,
          section_name: item.sectionName,
          status: item.status,
        },
        ['class_id'],
      );
    });

    payload.classAssignments.forEach(item => {
      upsert(
        transaction,
        'class_assignments',
        {
          class_assignment_id: item.classAssignmentId,
          class_id: item.classId,
          user_id: payload.user.userId,
          academic_year_id: item.academicYearId,
          year_name: item.yearName,
          grade_level_id: item.gradeLevelId,
          grade_level_name: item.gradeLevelName,
          section_id: item.sectionId,
          section_name: item.sectionName,
          subject_id: item.subjectId,
          subject_name: item.subjectName,
          assignment_role: item.assignmentRole,
          assignment_status: item.assignmentStatus,
        },
        ['class_assignment_id'],
      );
    });

    payload.students.forEach(item => {
      upsert(
        transaction,
        'students',
        {
          student_id: item.studentId,
          school_id: item.schoolId,
          student_lrn: item.studentLrn,
          first_name: item.firstName,
          middle_name: item.middleName,
          last_name: item.lastName,
          suffix: item.suffix,
          status: item.status,
        },
        ['student_id'],
      );
    });

    payload.classLists.forEach(item => {
      upsert(
        transaction,
        'class_lists',
        {
          class_list_id: item.classListId,
          class_id: item.classId,
          student_id: item.studentId,
        },
        ['class_list_id'],
      );
    });

    payload.tests.forEach(item => {
      upsert(
        transaction,
        'tests',
        {
          test_id: item.testId,
          class_assignment_id: item.classAssignmentId,
          term_period_id: item.termPeriodId,
          term_name: item.termName,
          test_name: item.testName,
          test_type: item.testType,
          test_date: item.testDate,
          instructions: item.instructions,
          total_items: item.totalItems,
          status: item.status,
        },
        ['test_id'],
      );
    });

    payload.testParts.forEach(item => {
      upsert(
        transaction,
        'test_parts',
        {
          test_part_id: item.testPartId,
          test_id: item.testId,
          part_order: item.partOrder,
          part_name: item.partName,
          part_type: item.partType,
          number_of_items: item.numberOfItems,
          points_per_item: Number(item.pointsPerItem),
        },
        ['test_part_id'],
      );
    });

    payload.questions.forEach(item => {
      upsert(
        transaction,
        'questions',
        {
          question_id: item.questionId,
          test_part_id: item.testPartId,
          item_number: item.itemNumber,
          question_text: item.questionText,
          option_a: item.optionA,
          option_b: item.optionB,
          option_c: item.optionC,
          option_d: item.optionD,
          option_e: item.optionE,
        },
        ['question_id'],
      );
    });

    payload.answerKeys.forEach(item => {
      upsert(
        transaction,
        'answer_keys',
        {
          question_id: item.questionId,
          correct_option: item.correctOption,
        },
        ['question_id'],
      );
    });

    payload.skills.forEach(item => {
      upsert(
        transaction,
        'skills',
        {
          skill_id: item.skillId,
          competency_id: item.competencyId,
          competency_name: item.competencyName,
          root_tag_id: item.rootTagId,
          root_tag_name: item.rootTagName,
          term_period_id: item.termPeriodId,
          grade_level_id: item.gradeLevelId,
          subject_id: item.subjectId,
        },
        ['skill_id'],
      );
    });

    payload.questionMappings.forEach(item => {
      upsert(
        transaction,
        'question_mappings',
        {
          question_id: item.questionId,
          skill_id: item.skillId,
        },
        ['question_id', 'skill_id'],
      );
    });

    transaction.execute(
      `INSERT INTO download_snapshots (
         contract_version,
         generated_at,
         downloaded_at,
         user_id
       ) VALUES (?, ?, ?, ?)`,
      [payload.contractVersion, payload.generatedAt, downloadedAt, payload.user.userId],
    );
  });
};

export interface V2LocalCounts {
  classes: number;
  classAssignments: number;
  classLists: number;
  students: number;
  tests: number;
  questions: number;
}

interface CountRow {
  count: number;
}

const countTable = (tableName: string): number => {
  const table = assertIdentifier(tableName);
  const rows = rowsToArray<CountRow>(getV2Database().execute(`SELECT COUNT(*) AS count FROM ${table}`));
  return Number(rows[0]?.count ?? 0);
};

export const getV2LocalCounts = (): V2LocalCounts => ({
  classes: countTable('classes'),
  classAssignments: countTable('class_assignments'),
  classLists: countTable('class_lists'),
  students: countTable('students'),
  tests: countTable('tests'),
  questions: countTable('questions'),
});
