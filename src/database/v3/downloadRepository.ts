import type { Transaction } from 'react-native-quick-sqlite';

import type {
  V3ClassAssignment,
  V3MobileDownload,
  V3PaperSizeCode,
} from './contracts';
import { V3_CONTRACT_VERSION, V3_SNAPSHOT_MODE } from './contracts';
import { v3NowIso, withV3Transaction } from './database';
import { canonicalJson, contentUuidFromSha256, sha256Hex } from './integrity';
import { firstV3Row, upsertV3Row, v3Boolean } from './sqlite';

interface V3DerivedClass {
  classId: number;
  academicYearId: number;
  academicYearName: string;
  gradeLevelId: number;
  gradeLevelName: string;
  sectionId: number;
  sectionName: string;
  status: string;
}

interface V3SnapshotEntity {
  name: string;
  rows: unknown[];
  keys: string[];
}

interface ExistingSnapshotRow {
  download_snapshot_id: number;
  payload_hash: string;
  snapshot_status: string;
}

interface IdRow {
  id: number;
}

interface ExistingAnswerSheetIdentityRow {
  test_assignment_id: number;
  assignment_uuid: string;
  generation_number: number;
  test_version_number: number;
  total_questions: number;
  total_pages: number;
  manifest_version: number;
  manifest_hash: string;
  required_scanner_version: string;
}

export interface V3DownloadSaveResult {
  snapshotUuid: string;
  payloadHash: string;
  status: 'committed' | 'replayed';
  entityCounts: Readonly<Record<string, number>>;
}

const assertUnique = <T>(
  values: T[],
  keyOf: (value: T) => string | number,
  label: string,
): Set<string | number> => {
  const keys = new Set<string | number>();
  values.forEach(value => {
    const key = keyOf(value);
    if (keys.has(key)) {
      throw new Error(`Duplicate ${label} ${String(key)}.`);
    }
    keys.add(key);
  });
  return keys;
};

const requireReference = (
  references: Set<string | number>,
  value: string | number,
  label: string,
): void => {
  if (!references.has(value)) {
    throw new Error(`${label} references missing id ${String(value)}.`);
  }
};

const deriveClasses = (assignments: V3ClassAssignment[]): V3DerivedClass[] => {
  const classes = new Map<number, V3DerivedClass>();

  assignments.forEach(item => {
    const candidate: V3DerivedClass = {
      classId: item.classId,
      academicYearId: item.academicYearId,
      academicYearName: item.academicYearName,
      gradeLevelId: item.gradeLevelId,
      gradeLevelName: item.gradeLevelName,
      sectionId: item.sectionId,
      sectionName: item.sectionName,
      status: item.classStatus,
    };
    const existing = classes.get(item.classId);
    if (existing && canonicalJson(existing) !== canonicalJson(candidate)) {
      throw new Error(
        `Class ${item.classId} has inconsistent metadata across assignments.`,
      );
    }
    classes.set(item.classId, candidate);
  });

  return [...classes.values()];
};

const validateDownloadRelationships = (
  payload: V3MobileDownload,
): V3DerivedClass[] => {
  if (payload.contractVersion !== V3_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported V3 contract version ${payload.contractVersion}.`,
    );
  }
  if (payload.snapshotMode !== V3_SNAPSHOT_MODE) {
    throw new Error(`Unsupported V3 snapshot mode ${payload.snapshotMode}.`);
  }

  const classes = deriveClasses(payload.classAssignments);
  const classIds = assertUnique(classes, item => item.classId, 'class id');
  const classAssignmentIds = assertUnique(
    payload.classAssignments,
    item => item.classAssignmentId,
    'class assignment id',
  );
  assertUnique(
    payload.classAssignmentSchedules,
    item => item.classAssignmentScheduleId,
    'class assignment schedule id',
  );
  assertUnique(
    payload.classAssignmentSchedules,
    item => item.scheduleUuid,
    'class assignment schedule UUID',
  );
  const studentIds = assertUnique(
    payload.students,
    item => item.studentId,
    'student id',
  );
  assertUnique(payload.classLists, item => item.classListId, 'class list id');
  const termPeriodIds = assertUnique(
    payload.termPeriods,
    item => item.termPeriodId,
    'term period id',
  );
  const testIds = assertUnique(payload.tests, item => item.testId, 'test id');
  const testAssignmentIds = assertUnique(
    payload.testAssignments,
    item => item.testAssignmentId,
    'test assignment id',
  );
  const assignmentUuids = assertUnique(
    payload.testAssignments,
    item => item.assignmentUuid,
    'test assignment UUID',
  );
  const testPartIds = assertUnique(
    payload.testParts,
    item => item.testPartId,
    'test part id',
  );
  const questionIds = assertUnique(
    payload.questions,
    item => item.questionId,
    'question id',
  );
  const skillIds = assertUnique(
    payload.skills,
    item => item.skillId,
    'skill id',
  );
  const testsById = new Map(payload.tests.map(item => [item.testId, item]));
  const assignmentsById = new Map(
    payload.testAssignments.map(item => [item.testAssignmentId, item]),
  );
  const partsById = new Map(
    payload.testParts.map(item => [item.testPartId, item]),
  );

  payload.classAssignments.forEach(item =>
    requireReference(classIds, item.classId, 'Class assignment'),
  );
  payload.classAssignmentSchedules.forEach(item =>
    requireReference(
      classAssignmentIds,
      item.classAssignmentId,
      'Class assignment schedule',
    ),
  );
  payload.classLists.forEach(item => {
    requireReference(classIds, item.classId, 'Class membership');
    requireReference(studentIds, item.studentId, 'Class membership');
  });
  payload.tests.forEach(item =>
    requireReference(termPeriodIds, item.termPeriodId, 'Test'),
  );
  payload.testAssignments.forEach(item => {
    requireReference(testIds, item.testId, 'Test assignment');
    requireReference(
      classAssignmentIds,
      item.classAssignmentId,
      'Test assignment',
    );
  });
  payload.testParts.forEach(item =>
    requireReference(testIds, item.testId, 'Test part'),
  );
  payload.questions.forEach(item => {
    requireReference(testPartIds, item.testPartId, 'Question');
    if (
      partsById.get(item.testPartId)?.questionTypeId !== item.questionTypeId
    ) {
      throw new Error(
        `Question ${item.questionId} does not match its test part question type.`,
      );
    }
  });
  payload.questionOptions.forEach(item =>
    requireReference(questionIds, item.questionId, 'Question option'),
  );
  payload.skills.forEach(item =>
    requireReference(termPeriodIds, item.termPeriodId, 'Skill'),
  );
  payload.partSkillMappings.forEach(item => {
    requireReference(testPartIds, item.testPartId, 'Part skill mapping');
    requireReference(skillIds, item.skillId, 'Part skill mapping');
    if (
      item.endItemNumber >
      Number(partsById.get(item.testPartId)?.numberOfItems ?? 0)
    ) {
      throw new Error(
        `Part skill mapping ${item.partSkillMappingId} exceeds its test part item count.`,
      );
    }
  });
  payload.answerSheets.forEach(item => {
    requireReference(testAssignmentIds, item.testAssignmentId, 'Answer sheet');
    requireReference(assignmentUuids, item.assignmentUuid, 'Answer sheet');
    const assignment = assignmentsById.get(item.testAssignmentId);
    if (assignment?.assignmentUuid !== item.assignmentUuid) {
      throw new Error(
        `Answer sheet ${item.answerSheetUuid} has mismatched assignment identities.`,
      );
    }
    const test = assignment ? testsById.get(assignment.testId) : null;
    if (
      !test ||
      test.versionNumber !== item.testVersionNumber ||
      test.totalItems !== item.totalQuestions
    ) {
      throw new Error(
        `Answer sheet ${item.answerSheetUuid} does not match its test version and item count.`,
      );
    }
  });

  assertUnique(
    payload.classLists,
    item => item.membershipUuid,
    'membership UUID',
  );
  assertUnique(payload.tests, item => item.testUuid, 'test UUID');
  assertUnique(payload.questions, item => item.questionUuid, 'question UUID');
  assertUnique(
    payload.questionOptions,
    item => item.questionOptionId,
    'question option id',
  );
  assertUnique(
    payload.partSkillMappings,
    item => item.partSkillMappingId,
    'part skill mapping id',
  );
  assertUnique(
    payload.answerSheets,
    item => item.answerSheetUuid,
    'answer sheet UUID',
  );
  return classes;
};

const snapshotEntities = (
  payload: V3MobileDownload,
  classes: V3DerivedClass[],
): V3SnapshotEntity[] => [
  {
    name: 'users',
    rows: [payload.teacher],
    keys: [String(payload.teacher.userId)],
  },
  {
    name: 'classes',
    rows: classes,
    keys: classes.map(item => String(item.classId)),
  },
  {
    name: 'class_assignments',
    rows: payload.classAssignments,
    keys: payload.classAssignments.map(item => String(item.classAssignmentId)),
  },
  {
    name: 'class_assignment_schedules',
    rows: payload.classAssignmentSchedules,
    keys: payload.classAssignmentSchedules.map(item =>
      String(item.classAssignmentScheduleId),
    ),
  },
  {
    name: 'class_lists',
    rows: payload.classLists,
    keys: payload.classLists.map(item => String(item.classListId)),
  },
  {
    name: 'students',
    rows: payload.students,
    keys: payload.students.map(item => String(item.studentId)),
  },
  {
    name: 'term_periods',
    rows: payload.termPeriods,
    keys: payload.termPeriods.map(item => String(item.termPeriodId)),
  },
  {
    name: 'test_assignments',
    rows: payload.testAssignments,
    keys: payload.testAssignments.map(item => String(item.testAssignmentId)),
  },
  {
    name: 'tests',
    rows: payload.tests,
    keys: payload.tests.map(item => String(item.testId)),
  },
  {
    name: 'test_parts',
    rows: payload.testParts,
    keys: payload.testParts.map(item => String(item.testPartId)),
  },
  {
    name: 'questions',
    rows: payload.questions,
    keys: payload.questions.map(item => String(item.questionId)),
  },
  {
    name: 'question_options',
    rows: payload.questionOptions,
    keys: payload.questionOptions.map(item => String(item.questionOptionId)),
  },
  {
    name: 'skills',
    rows: payload.skills,
    keys: payload.skills.map(item => String(item.skillId)),
  },
  {
    name: 'part_skill_mappings',
    rows: payload.partSkillMappings,
    keys: payload.partSkillMappings.map(item =>
      String(item.partSkillMappingId),
    ),
  },
  {
    name: 'answer_sheet_versions',
    rows: payload.answerSheets,
    keys: payload.answerSheets.map(item => item.answerSheetUuid),
  },
];

const requirePaperSizeId = (
  transaction: Transaction,
  code: V3PaperSizeCode,
): number => {
  const row = firstV3Row<IdRow>(
    transaction.execute(
      `SELECT paper_size_id AS id FROM paper_sizes WHERE paper_size_code = ?`,
      [code],
    ),
  );
  if (!row) {
    throw new Error(
      `Paper size ${code} is unavailable. Save V3 reference data before the download snapshot.`,
    );
  }
  return Number(row.id);
};

const writeDownloadRows = (
  transaction: Transaction,
  payload: V3MobileDownload,
  classes: V3DerivedClass[],
): void => {
  upsertV3Row(
    transaction,
    'users',
    {
      user_id: payload.teacher.userId,
      school_id: payload.teacher.schoolId,
      email: payload.teacher.email,
      role: 'teacher',
      status: 'active',
    },
    ['user_id'],
  );

  classes.forEach(item =>
    upsertV3Row(
      transaction,
      'classes',
      {
        class_id: item.classId,
        academic_year_id: item.academicYearId,
        academic_year_name: item.academicYearName,
        grade_level_id: item.gradeLevelId,
        grade_level_name: item.gradeLevelName,
        section_id: item.sectionId,
        section_name: item.sectionName,
        status: item.status,
      },
      ['class_id'],
    ),
  );

  payload.classAssignments.forEach(item =>
    upsertV3Row(
      transaction,
      'class_assignments',
      {
        class_assignment_id: item.classAssignmentId,
        class_id: item.classId,
        teacher_user_id: payload.teacher.userId,
        subject_id: item.subjectId,
        subject_code: item.subjectCode,
        subject_name: item.subjectName,
        assignment_role: item.assignmentRole,
        assignment_status: item.status,
      },
      ['class_assignment_id'],
    ),
  );

  payload.classAssignmentSchedules.forEach(item =>
    upsertV3Row(
      transaction,
      'class_assignment_schedules',
      {
        class_assignment_schedule_id: item.classAssignmentScheduleId,
        schedule_uuid: item.scheduleUuid,
        class_assignment_id: item.classAssignmentId,
        day_of_week: item.dayOfWeek,
        start_time: item.startTime,
        end_time: item.endTime,
        timezone_name: item.timezoneName,
        effective_from: item.effectiveFrom,
        effective_to: item.effectiveTo,
        schedule_status: item.scheduleStatus,
        // The wire contract exposes updatedAt but no separate createdAt.
        created_at: item.updatedAt,
        updated_at: item.updatedAt,
      },
      ['class_assignment_schedule_id'],
    ),
  );

  payload.students.forEach(item =>
    upsertV3Row(
      transaction,
      'students',
      {
        student_id: item.studentId,
        school_id: payload.teacher.schoolId,
        student_lrn: item.studentLrn,
        first_name: item.firstName,
        middle_name: item.middleName,
        last_name: item.lastName,
        suffix: item.suffix,
        gender: item.gender,
        status: item.status,
      },
      ['student_id'],
    ),
  );

  payload.classLists.forEach(item =>
    upsertV3Row(
      transaction,
      'class_lists',
      {
        class_list_id: item.classListId,
        membership_uuid: item.membershipUuid,
        class_id: item.classId,
        student_id: item.studentId,
        enrollment_status: item.enrollmentStatus,
        enrollment_source: item.enrollmentSource,
        enrolled_at: item.enrolledAt,
      },
      ['class_list_id'],
    ),
  );

  payload.termPeriods.forEach(item =>
    upsertV3Row(
      transaction,
      'term_periods',
      {
        term_period_id: item.termPeriodId,
        academic_year_id: item.academicYearId,
        term_name: item.termName,
        term_order: item.termOrder,
        start_at: item.startAt,
        end_at: item.endAt,
        status: item.status,
      },
      ['term_period_id'],
    ),
  );

  payload.tests.forEach(item =>
    upsertV3Row(
      transaction,
      'tests',
      {
        test_id: item.testId,
        test_uuid: item.testUuid,
        version_number: item.versionNumber,
        term_period_id: item.termPeriodId,
        test_name: item.testName,
        test_type: item.testType,
        instructions: item.instructions,
        total_items: item.totalItems,
        status: item.status,
      },
      ['test_id'],
    ),
  );

  payload.testAssignments.forEach(item =>
    upsertV3Row(
      transaction,
      'test_assignments',
      {
        test_assignment_id: item.testAssignmentId,
        assignment_uuid: item.assignmentUuid,
        test_id: item.testId,
        class_assignment_id: item.classAssignmentId,
        open_at: item.openAt,
        close_at: item.closeAt,
        assignment_status: item.assignmentStatus,
        allow_late_capture: v3Boolean(item.allowLateCapture),
        capture_allowed_now: v3Boolean(item.captureAllowedNow),
        capture_availability: item.captureAvailability,
      },
      ['test_assignment_id'],
    ),
  );

  payload.testParts.forEach(item =>
    upsertV3Row(
      transaction,
      'test_parts',
      {
        test_part_id: item.testPartId,
        test_id: item.testId,
        part_order: item.partOrder,
        part_name: item.partName,
        question_type_id: item.questionTypeId,
        number_of_items: item.numberOfItems,
        points_per_item: item.pointsPerItem,
        instructions: item.instructions,
      },
      ['test_part_id'],
    ),
  );

  payload.questions.forEach(item =>
    upsertV3Row(
      transaction,
      'questions',
      {
        question_id: item.questionId,
        question_uuid: item.questionUuid,
        test_part_id: item.testPartId,
        question_type_id: item.questionTypeId,
        item_number: item.itemNumber,
        global_item_number: item.globalItemNumber,
        question_text: item.questionText,
        maximum_points: item.maximumPoints,
        rubric_id: item.rubricId,
        response_instructions: item.responseInstructions,
        answer_order_required: v3Boolean(item.answerOrderRequired),
        maximum_response_length: item.maximumResponseLength,
        expected_response_count: item.expectedResponseCount,
        response_region_size: item.responseRegionSize,
        force_page_break_before: v3Boolean(item.forcePageBreakBefore),
      },
      ['question_id'],
    ),
  );

  payload.questionOptions.forEach(item =>
    upsertV3Row(
      transaction,
      'question_options',
      {
        question_option_id: item.questionOptionId,
        question_id: item.questionId,
        option_key: item.optionKey,
        option_text: item.optionText,
        option_order: item.optionOrder,
      },
      ['question_option_id'],
    ),
  );

  payload.skills.forEach(item =>
    upsertV3Row(
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
    ),
  );

  payload.partSkillMappings.forEach(item =>
    upsertV3Row(
      transaction,
      'part_skill_mappings',
      {
        part_skill_mapping_id: item.partSkillMappingId,
        test_part_id: item.testPartId,
        skill_id: item.skillId,
        start_item_number: item.startItemNumber,
        end_item_number: item.endItemNumber,
        item_count: item.itemCount,
      },
      ['part_skill_mapping_id'],
    ),
  );

  payload.answerSheets.forEach(item => {
    const paperSizeId = requirePaperSizeId(transaction, item.paperSize);
    const existing = firstV3Row<ExistingAnswerSheetIdentityRow>(
      transaction.execute(
        `SELECT test_assignment_id, assignment_uuid, generation_number,
                test_version_number, total_questions, total_pages,
                manifest_version, manifest_hash, required_scanner_version
           FROM answer_sheet_versions
          WHERE answer_sheet_uuid = ?`,
        [item.answerSheetUuid],
      ),
    );
    if (
      existing &&
      (Number(existing.test_assignment_id) !== item.testAssignmentId ||
        existing.assignment_uuid !== item.assignmentUuid ||
        Number(existing.generation_number) !== item.generationNumber ||
        Number(existing.test_version_number) !== item.testVersionNumber ||
        Number(existing.total_questions) !== item.totalQuestions ||
        Number(existing.total_pages) !== item.totalPages ||
        Number(existing.manifest_version) !== item.manifestVersion ||
        existing.manifest_hash !== item.manifestHash ||
        existing.required_scanner_version !== item.requiredScannerVersion)
    ) {
      throw new Error(
        `Answer sheet identity ${item.answerSheetUuid} is immutable and cannot be replaced.`,
      );
    }
    upsertV3Row(
      transaction,
      'answer_sheet_versions',
      {
        answer_sheet_uuid: item.answerSheetUuid,
        test_assignment_id: item.testAssignmentId,
        assignment_uuid: item.assignmentUuid,
        paper_size_id: paperSizeId,
        generation_number: item.generationNumber,
        test_version_number: item.testVersionNumber,
        total_questions: item.totalQuestions,
        total_pages: item.totalPages,
        manifest_version: item.manifestVersion,
        manifest_hash: item.manifestHash,
        required_scanner_version: item.requiredScannerVersion,
        generation_status: 'ready',
        generated_at: item.generatedAt,
      },
      ['answer_sheet_uuid'],
    );
  });
};

export const saveV3MobileDownload = async (
  payload: V3MobileDownload,
): Promise<V3DownloadSaveResult> => {
  const classes = validateDownloadRelationships(payload);
  const entities = snapshotEntities(payload, classes);
  const payloadHash = sha256Hex(payload);
  const snapshotUuid = contentUuidFromSha256(payloadHash);
  const downloadedAt = v3NowIso();
  let replayed = false;

  await withV3Transaction(transaction => {
    upsertV3Row(
      transaction,
      'users',
      {
        user_id: payload.teacher.userId,
        school_id: payload.teacher.schoolId,
        email: payload.teacher.email,
        role: 'teacher',
        status: 'active',
      },
      ['user_id'],
    );

    const existing = firstV3Row<ExistingSnapshotRow>(
      transaction.execute(
        `SELECT download_snapshot_id, payload_hash, snapshot_status
           FROM download_snapshots
          WHERE snapshot_uuid = ?`,
        [snapshotUuid],
      ),
    );
    if (
      existing?.payload_hash === payloadHash &&
      existing.snapshot_status === 'complete'
    ) {
      replayed = true;
      return;
    }
    if (existing && existing.payload_hash !== payloadHash) {
      throw new Error(`Snapshot UUID collision for ${snapshotUuid}.`);
    }

    if (existing) {
      transaction.execute(
        `UPDATE download_snapshots
            SET snapshot_status = 'downloading',
                downloaded_at = ?,
                committed_at = NULL,
                last_error = NULL
          WHERE download_snapshot_id = ?`,
        [downloadedAt, existing.download_snapshot_id],
      );
    } else {
      transaction.execute(
        `INSERT INTO download_snapshots (
           snapshot_uuid, contract_version, snapshot_mode, payload_hash,
           snapshot_status, generated_at, downloaded_at, teacher_user_id
         ) VALUES (?, ?, ?, ?, 'downloading', ?, ?, ?)`,
        [
          snapshotUuid,
          payload.contractVersion,
          payload.snapshotMode,
          payloadHash,
          payload.generatedAt,
          downloadedAt,
          payload.teacher.userId,
        ],
      );
    }

    const snapshot = firstV3Row<{ download_snapshot_id: number }>(
      transaction.execute(
        `SELECT download_snapshot_id
           FROM download_snapshots
          WHERE snapshot_uuid = ?`,
        [snapshotUuid],
      ),
    );
    if (!snapshot) {
      throw new Error('Unable to resolve the V3 download snapshot row.');
    }

    writeDownloadRows(transaction, payload, classes);
    entities.forEach(entity => {
      upsertV3Row(
        transaction,
        'download_snapshot_entities',
        {
          download_snapshot_id: snapshot.download_snapshot_id,
          entity_name: entity.name,
          row_count: entity.rows.length,
          payload_hash: sha256Hex(entity.rows),
        },
        ['download_snapshot_id', 'entity_name'],
      );
      entity.keys.forEach(key =>
        upsertV3Row(
          transaction,
          'download_snapshot_rows',
          {
            download_snapshot_id: snapshot.download_snapshot_id,
            entity_name: entity.name,
            entity_key: key,
          },
          ['download_snapshot_id', 'entity_name', 'entity_key'],
        ),
      );
    });

    transaction.execute(
      `UPDATE download_snapshots
          SET snapshot_status = 'superseded'
        WHERE snapshot_status = 'complete'
          AND download_snapshot_id <> ?`,
      [snapshot.download_snapshot_id],
    );
    transaction.execute(
      `UPDATE download_snapshots
          SET snapshot_status = 'complete', committed_at = ?
        WHERE download_snapshot_id = ?`,
      [downloadedAt, snapshot.download_snapshot_id],
    );
  });

  return {
    snapshotUuid,
    payloadHash,
    status: replayed ? 'replayed' : 'committed',
    entityCounts: Object.freeze(
      Object.fromEntries(
        entities.map(entity => [entity.name, entity.rows.length]),
      ),
    ),
  };
};
