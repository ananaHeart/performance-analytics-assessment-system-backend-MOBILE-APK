import type {Transaction} from 'react-native-quick-sqlite';

import type {
  AnswerOption,
  AnswerStatus,
  CaptureSource,
  DetectionStatus,
  RawMarkInformation,
  VerificationStatus,
} from './contracts';
import {getV2Database, nowIso, rowsToArray, withV2Transaction} from './database';
import {createV2Uuid} from './uuid';
import type {OmrScanResult} from '../../native/omrScanner';

interface ContextRow {
  test_id: number;
  class_list_id: number;
}

interface QuestionRow {
  question_id: number;
  item_number: number;
  part_order: number;
  part_type: string;
  points_per_item: number;
  correct_option: AnswerOption | null;
}

interface ExistingResultRow {
  test_result_id: number;
  result_uuid: string;
  central_test_result_id: number | null;
  sync_action: 'create' | 'update';
  is_synced: number;
}

interface ExistingAnswerRow {
  answer_uuid: string;
}

interface SavedAttemptRow {
  test_result_id: number;
  result_uuid: string;
  provisional_total_score: number | null;
  provisional_max_score: number | null;
  checked_at: string | null;
  scan_session_id: number | null;
  scan_uuid: string | null;
  image_uri: string | null;
  template_version: string | null;
  scanner_version: string | null;
  scanned_at: string | null;
  verified_at: string | null;
}

interface SavedAnswerRow {
  question_id: number;
  item_number: number;
  part_order: number;
  selected_option: AnswerOption | null;
  answer_status: AnswerStatus | null;
  capture_source: CaptureSource | null;
  answer_verified_at: string | null;
  detected_option: AnswerOption | null;
  confidence_score: number | null;
  detection_status: DetectionStatus | null;
  verification_status: VerificationStatus | null;
  raw_mark: string | null;
}

export interface V2OmrQuestion {
  questionId: number;
  sheetItemNumber: number;
  partItemNumber: number;
  partOrder: number;
  pointsPerItem: number;
  correctOption: AnswerOption | null;
}

export interface V2OmrContext {
  testId: number;
  classListId: number;
  questions: V2OmrQuestion[];
}

export interface V2OmrContextResolution {
  context: V2OmrContext | null;
  reason: string | null;
}

export interface VerifiedOmrAnswer {
  itemNumber: number;
  selectedOption: AnswerOption | null;
  answerStatus: Extract<AnswerStatus, 'answered' | 'blank' | 'multiple'>;
  verificationStatus: Exclude<VerificationStatus, 'pending'>;
}

export interface SavedV2OmrAttempt {
  resultUuid: string;
  scanUuid: string;
  provisionalTotalScore: number;
  provisionalMaxScore: number;
}

export interface SavedV2OmrAnswerReview {
  questionId: number;
  itemNumber: number;
  selectedOption: AnswerOption | null;
  answerStatus: AnswerStatus;
  captureSource: CaptureSource;
  verifiedAt: string;
  detectedOption: AnswerOption | null;
  confidenceScore: number;
  detectionStatus: DetectionStatus;
  verificationStatus: VerificationStatus;
  rawMarkInformation: RawMarkInformation;
}

export interface SavedV2OmrReview {
  resultUuid: string;
  provisionalTotalScore: number;
  provisionalMaxScore: number;
  checkedAt: string | null;
  scan: {
    scanUuid: string;
    imageUri: string | null;
    templateVersion: string;
    scannerVersion: string;
    scannedAt: string;
    verifiedAt: string | null;
  } | null;
  answers: SavedV2OmrAnswerReview[];
}

const normalizePartType = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s-]+/g, '_');

export const resolveV2OmrContext = (
  testId: number,
  studentId: number,
  teacherId: number,
): V2OmrContextResolution => {
  const database = getV2Database();
  const contexts = rowsToArray<ContextRow>(
    database.execute(
      `SELECT t.test_id, cl.class_list_id
       FROM tests t
       INNER JOIN class_assignments ca
         ON ca.class_assignment_id = t.class_assignment_id
       INNER JOIN class_lists cl
         ON cl.class_id = ca.class_id
       WHERE t.test_id = ?
         AND cl.student_id = ?
         AND ca.user_id = ?
         AND LOWER(t.status) = 'active'
         AND LOWER(ca.assignment_status) = 'active'
       LIMIT 1`,
      [testId, studentId, teacherId],
    ),
  );

  const contextRow = contexts[0];
  if (!contextRow) {
    return {
      context: null,
      reason: 'This assessment and student are not available in the downloaded data yet.',
    };
  }

  const questionRows = rowsToArray<QuestionRow>(
    database.execute(
      `SELECT
         q.question_id,
         q.item_number,
         tp.part_order,
         tp.part_type,
         tp.points_per_item,
         ak.correct_option
       FROM questions q
       INNER JOIN test_parts tp ON tp.test_part_id = q.test_part_id
       LEFT JOIN answer_keys ak ON ak.question_id = q.question_id
       WHERE tp.test_id = ?
       ORDER BY tp.part_order, q.item_number, q.question_id`,
      [testId],
    ),
  );

  if (questionRows.length !== 10) {
    return {
      context: null,
      reason: `The fixed scanner requires exactly 10 downloaded questions; ${questionRows.length} were found.`,
    };
  }

  if (questionRows.some(row => normalizePartType(row.part_type) !== 'multiple_choice')) {
    return {
      context: null,
      reason: 'The selected assessment is not a 10-item Multiple Choice sheet.',
    };
  }

  return {
    context: {
      testId: contextRow.test_id,
      classListId: contextRow.class_list_id,
      questions: questionRows.map((row, index) => ({
        questionId: row.question_id,
        sheetItemNumber: index + 1,
        partItemNumber: row.item_number,
        partOrder: row.part_order,
        pointsPerItem: Number(row.points_per_item),
        correctOption: row.correct_option,
      })),
    },
    reason: null,
  };
};

const parseRawMark = (value: string | null): RawMarkInformation => {
  if (!value) return {};

  try {
    return JSON.parse(value) as RawMarkInformation;
  } catch {
    return {};
  }
};

export const getSavedV2OmrReview = (
  testId: number,
  studentId: number,
  teacherId: number,
): SavedV2OmrReview | null => {
  const database = getV2Database();
  const savedContext = rowsToArray<ContextRow>(
    database.execute(
      `SELECT t.test_id, cl.class_list_id
       FROM tests t
       INNER JOIN class_assignments ca
         ON ca.class_assignment_id = t.class_assignment_id
       INNER JOIN class_lists cl
         ON cl.class_id = ca.class_id
       WHERE t.test_id = ?
         AND cl.student_id = ?
         AND ca.user_id = ?
       LIMIT 1`,
      [testId, studentId, teacherId],
    ),
  )[0];

  if (!savedContext) return null;

  const attempt = rowsToArray<SavedAttemptRow>(
    database.execute(
      `SELECT
         tr.test_result_id,
         tr.result_uuid,
         tr.provisional_total_score,
         tr.provisional_max_score,
         tr.checked_at,
         ss.scan_session_id,
         ss.scan_uuid,
         ss.image_uri,
         ss.template_version,
         ss.scanner_version,
         ss.scanned_at,
         ss.verified_at
       FROM test_results tr
       LEFT JOIN test_result_scans trs
         ON trs.test_result_id = tr.test_result_id
        AND trs.link_status = 'selected'
       LEFT JOIN scan_sessions ss ON ss.scan_session_id = trs.scan_session_id
       WHERE tr.test_id = ?
         AND tr.class_list_id = ?
         AND tr.result_status = 'verified'
       ORDER BY tr.attempt_number DESC, tr.updated_at DESC
       LIMIT 1`,
      [testId, savedContext.class_list_id],
    ),
  )[0];

  if (!attempt) return null;

  const rows = rowsToArray<SavedAnswerRow>(
    database.execute(
      `SELECT
         q.question_id,
         q.item_number,
         tp.part_order,
         sa.selected_option,
         sa.answer_status,
         sa.capture_source,
         sa.verified_at AS answer_verified_at,
         od.detected_option,
         od.confidence_score,
         od.detection_status,
         od.verification_status,
         od.raw_mark
       FROM questions q
       INNER JOIN test_parts tp ON tp.test_part_id = q.test_part_id
       LEFT JOIN student_answers sa
         ON sa.test_result_id = ?
        AND sa.question_id = q.question_id
       LEFT JOIN omr_detections od
         ON od.scan_session_id = ?
        AND od.question_id = q.question_id
       WHERE tp.test_id = ?
       ORDER BY tp.part_order, q.item_number, q.question_id`,
      [attempt.test_result_id, attempt.scan_session_id, testId],
    ),
  );

  const answers = rows.flatMap<SavedV2OmrAnswerReview>((row, index) => {
    if (!row.answer_status || !row.capture_source || !row.answer_verified_at) return [];

    return [{
      questionId: row.question_id,
      itemNumber: index + 1,
      selectedOption: row.selected_option,
      answerStatus: row.answer_status,
      captureSource: row.capture_source,
      verifiedAt: row.answer_verified_at,
      detectedOption: row.detected_option,
      confidenceScore: Number(row.confidence_score ?? 0),
      detectionStatus: row.detection_status ?? 'uncertain',
      verificationStatus: row.verification_status ?? 'pending',
      rawMarkInformation: parseRawMark(row.raw_mark),
    }];
  });

  return {
    resultUuid: attempt.result_uuid,
    provisionalTotalScore: Number(attempt.provisional_total_score ?? 0),
    provisionalMaxScore: Number(attempt.provisional_max_score ?? 0),
    checkedAt: attempt.checked_at,
    scan: attempt.scan_uuid && attempt.template_version && attempt.scanner_version && attempt.scanned_at
      ? {
        scanUuid: attempt.scan_uuid,
        imageUri: attempt.image_uri,
        templateVersion: attempt.template_version,
        scannerVersion: attempt.scanner_version,
        scannedAt: attempt.scanned_at,
        verifiedAt: attempt.verified_at,
      }
      : null,
    answers,
  };
};

const queryOne = <T>(transaction: Transaction, sql: string, params: unknown[]): T | null =>
  rowsToArray<T>(transaction.execute(sql, params))[0] ?? null;

export const saveVerifiedV2OmrAttempt = async (
  context: V2OmrContext,
  teacherId: number,
  scanResult: OmrScanResult,
  answers: VerifiedOmrAnswer[],
): Promise<SavedV2OmrAttempt> => {
  if (answers.length !== context.questions.length) {
    throw new Error('Every scanned item must be reviewed before it can be saved.');
  }

  const answerByItem = new Map(answers.map(answer => [answer.itemNumber, answer]));
  const detectionByItem = new Map(scanResult.detections.map(item => [item.itemNumber, item]));
  const verifiedAt = nowIso();
  const scannedAt = scanResult.detections[0]?.detectedAt ?? verifiedAt;
  const scanUuid = createV2Uuid();
  let resultUuid = '';
  let provisionalTotalScore = 0;
  let provisionalMaxScore = 0;

  context.questions.forEach(question => {
    const answer = answerByItem.get(question.sheetItemNumber);
    if (!answer) {
      throw new Error(`Missing reviewed answer for item ${question.sheetItemNumber}.`);
    }
    provisionalMaxScore += question.pointsPerItem;
    if (question.correctOption && answer.selectedOption === question.correctOption) {
      provisionalTotalScore += question.pointsPerItem;
    }
  });

  await withV2Transaction(transaction => {
    const existingResult = queryOne<ExistingResultRow>(
      transaction,
      `SELECT
         test_result_id,
         result_uuid,
         central_test_result_id,
         sync_action,
         is_synced
       FROM test_results
       WHERE test_id = ? AND class_list_id = ? AND attempt_number = 1`,
      [context.testId, context.classListId],
    );

    const nextSyncAction = existingResult &&
      (existingResult.central_test_result_id != null || existingResult.is_synced === 1)
      ? 'update'
      : existingResult?.sync_action ?? 'create';

    let testResultId: number;
    if (existingResult) {
      testResultId = existingResult.test_result_id;
      resultUuid = existingResult.result_uuid;
      transaction.execute(
        `UPDATE test_results
         SET result_status = 'verified',
             checked_at = ?,
             provisional_total_score = ?,
             provisional_max_score = ?,
             provisional_items_evaluated = ?,
             sync_action = ?,
             is_synced = 0,
             last_sync_error = NULL,
             updated_at = ?
         WHERE test_result_id = ?`,
        [
          verifiedAt,
          provisionalTotalScore,
          provisionalMaxScore,
          context.questions.length,
          nextSyncAction,
          verifiedAt,
          testResultId,
        ],
      );
      transaction.execute(
        `UPDATE test_result_scans
         SET link_status = 'superseded', updated_at = ?
         WHERE test_result_id = ? AND link_status = 'selected'`,
        [verifiedAt, testResultId],
      );
    } else {
      resultUuid = createV2Uuid();
      const resultInsert = transaction.execute(
        `INSERT INTO test_results (
           result_uuid,
           test_id,
           class_list_id,
           attempt_number,
           result_status,
           checked_at,
           provisional_total_score,
           provisional_max_score,
           provisional_items_evaluated,
           sync_action,
           is_synced,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, 1, 'verified', ?, ?, ?, ?, 'create', 0, ?, ?)`,
        [
          resultUuid,
          context.testId,
          context.classListId,
          verifiedAt,
          provisionalTotalScore,
          provisionalMaxScore,
          context.questions.length,
          verifiedAt,
          verifiedAt,
        ],
      );
      testResultId = Number(resultInsert.insertId);
    }

    const scanInsert = transaction.execute(
      `INSERT INTO scan_sessions (
         scan_uuid,
         test_id,
         class_list_id,
         scanned_by_user_id,
         verified_by_user_id,
         template_version,
         scanner_version,
         image_hash,
         image_uri,
         scan_status,
         scanned_at,
         verified_at,
         is_synced,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, 0, ?, ?)`,
      [
        scanUuid,
        context.testId,
        context.classListId,
        teacherId,
        teacherId,
        scanResult.templateVersion,
        scanResult.scannerVersion,
        scanResult.imageHash,
        scanResult.sourceImageUri,
        scannedAt,
        verifiedAt,
        verifiedAt,
        verifiedAt,
      ],
    );
    const scanSessionId = Number(scanInsert.insertId);

    context.questions.forEach(question => {
      const detection = detectionByItem.get(question.sheetItemNumber);
      const answer = answerByItem.get(question.sheetItemNumber);
      if (!detection || !answer) {
        throw new Error(`Scanner output is incomplete for item ${question.sheetItemNumber}.`);
      }

      transaction.execute(
        `INSERT INTO omr_detections (
           scan_session_id,
           question_id,
           detected_option,
           confidence_score,
           detection_status,
           verification_status,
           raw_mark,
           detected_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          scanSessionId,
          question.questionId,
          detection.detectedOption,
          detection.confidenceScore,
          detection.detectionStatus,
          answer.verificationStatus,
          JSON.stringify(detection.rawMarkInformation),
          detection.detectedAt,
          verifiedAt,
        ],
      );

      const existingAnswer = queryOne<ExistingAnswerRow>(
        transaction,
        `SELECT answer_uuid
         FROM student_answers
         WHERE test_result_id = ? AND question_id = ?`,
        [testResultId, question.questionId],
      );
      const answerUuid = existingAnswer?.answer_uuid ?? createV2Uuid();
      const scannerWasConfirmed = answer.verificationStatus === 'confirmed';
      const captureSource = scannerWasConfirmed ? 'omr' : 'teacher_correction';
      const answerStatus = answer.answerStatus;
      const provisionalIsCorrect = question.correctOption == null
        ? null
        : Number(answer.selectedOption === question.correctOption);
      const provisionalPoints = provisionalIsCorrect === 1 ? question.pointsPerItem : 0;
      const correctionReason = scannerWasConfirmed ? null : 'Teacher corrected or resolved OMR output.';

      transaction.execute(
        `INSERT INTO student_answers (
           test_result_id,
           question_id,
           verified_by_user_id,
           answer_uuid,
           capture_source,
           verified_at,
           selected_option,
           answer_status,
           correction_reason,
           provisional_is_correct,
           provisional_points_earned,
           is_synced,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(test_result_id, question_id) DO UPDATE SET
           verified_by_user_id = excluded.verified_by_user_id,
           capture_source = excluded.capture_source,
           verified_at = excluded.verified_at,
           selected_option = excluded.selected_option,
           answer_status = excluded.answer_status,
           correction_reason = excluded.correction_reason,
           provisional_is_correct = excluded.provisional_is_correct,
           provisional_points_earned = excluded.provisional_points_earned,
           is_synced = 0,
           last_sync_error = NULL,
           updated_at = excluded.updated_at`,
        [
          testResultId,
          question.questionId,
          teacherId,
          answerUuid,
          captureSource,
          verifiedAt,
          answer.selectedOption,
          answerStatus,
          correctionReason,
          provisionalIsCorrect,
          provisionalPoints,
          verifiedAt,
          verifiedAt,
        ],
      );
    });

    transaction.execute(
      `INSERT INTO test_result_scans (
         test_result_id,
         scan_session_id,
         link_status,
         decided_by_user_id,
         decision_reason,
         linked_at,
         updated_at
       ) VALUES (?, ?, 'selected', ?, 'Teacher verified this scan.', ?, ?)`,
      [testResultId, scanSessionId, teacherId, verifiedAt, verifiedAt],
    );
  });

  return {
    resultUuid,
    scanUuid,
    provisionalTotalScore,
    provisionalMaxScore,
  };
};
