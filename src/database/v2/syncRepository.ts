import type {Transaction} from 'react-native-quick-sqlite';

import {
  V2_CONTRACT_VERSION,
  type AnswerOption,
  type AnswerStatus,
  type BatchSyncStatus,
  type CaptureSource,
  type DetectionStatus,
  type RawMarkInformation,
  type SyncAction,
  type V2AnswerUpload,
  type V2DetectionUpload,
  type V2ResultUpload,
  type V2ScanSessionUpload,
  type V2UploadPayload,
  type V2UploadResponse,
  type VerificationStatus,
} from './contracts';
import {getV2Database, nowIso, rowsToArray, withV2Transaction} from './database';
import {createV2Uuid} from './uuid';

interface UnsyncedResultRow {
  test_result_id: number;
  result_uuid: string;
  class_list_id: number;
  attempt_number: number;
  checked_at: string;
  sync_action: SyncAction;
}

interface AnswerRow {
  answer_uuid: string;
  question_id: number;
  selected_option: AnswerOption | null;
  answer_status: AnswerStatus;
  capture_source: CaptureSource;
  verified_at: string;
  correction_reason: string | null;
}

interface ScanRow {
  scan_session_id: number;
  scan_uuid: string;
  template_version: string;
  scanner_version: string;
  image_hash: string | null;
  scanned_at: string;
  verified_at: string;
}

interface DetectionRow {
  question_id: number;
  detected_option: AnswerOption | null;
  confidence_score: number;
  detection_status: DetectionStatus;
  verification_status: VerificationStatus;
  raw_mark: string;
  detected_at: string;
}

interface QuestionNumberRow {
  question_id: number;
}

interface BatchRow {
  sync_batch_id: number;
  sync_uuid: string;
}

interface BatchItemRow {
  result_uuid: string;
}

export interface PreparedV2Upload {
  syncBatchId: number;
  payload: V2UploadPayload;
}

const parseRawMark = (value: string): RawMarkInformation => {
  try {
    return JSON.parse(value) as RawMarkInformation;
  } catch {
    return {};
  }
};

const sameStrings = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(value => rightSet.has(value));
};

const findRetryBatch = (testId: number, resultUuids: string[]): BatchRow | null => {
  const database = getV2Database();
  const batches = rowsToArray<BatchRow>(database.execute(
    `SELECT sync_batch_id, sync_uuid
     FROM sync_batches
     WHERE test_id = ?
       AND sync_status IN ('pending', 'in_progress', 'partial_success', 'failed')
     ORDER BY sync_batch_id DESC`,
    [testId],
  ));

  for (const batch of batches) {
    const pendingItems = rowsToArray<BatchItemRow>(database.execute(
      `SELECT result_uuid
       FROM sync_result_items
       WHERE sync_batch_id = ? AND sync_status <> 'success'`,
      [batch.sync_batch_id],
    )).map(item => item.result_uuid);
    if (sameStrings(pendingItems, resultUuids)) return batch;
  }

  return null;
};

const buildQuestionNumberMap = (testId: number): Map<number, number> => {
  const rows = rowsToArray<QuestionNumberRow>(getV2Database().execute(
    `SELECT q.question_id
     FROM questions q
     INNER JOIN test_parts tp ON tp.test_part_id = q.test_part_id
     WHERE tp.test_id = ?
     ORDER BY tp.part_order, q.item_number, q.question_id`,
    [testId],
  ));
  return new Map(rows.map((row, index) => [row.question_id, index + 1]));
};

const buildResultUpload = (
  result: UnsyncedResultRow,
  questionNumbers: Map<number, number>,
): V2ResultUpload => {
  const database = getV2Database();
  const answers = rowsToArray<AnswerRow>(database.execute(
    `SELECT
       answer_uuid,
       question_id,
       selected_option,
       answer_status,
       capture_source,
       verified_at,
       correction_reason
     FROM student_answers
     WHERE test_result_id = ?
     ORDER BY student_answer_id`,
    [result.test_result_id],
  )).map<V2AnswerUpload>(answer => ({
    answerUuid: answer.answer_uuid,
    questionId: answer.question_id,
    selectedOption: answer.selected_option,
    answerStatus: answer.answer_status,
    captureSource: answer.capture_source,
    verifiedAt: answer.verified_at,
    correctionReason: answer.correction_reason,
  }));

  const scan = rowsToArray<ScanRow>(database.execute(
    `SELECT
       ss.scan_session_id,
       ss.scan_uuid,
       ss.template_version,
       ss.scanner_version,
       ss.image_hash,
       ss.scanned_at,
       ss.verified_at
     FROM test_result_scans trs
     INNER JOIN scan_sessions ss ON ss.scan_session_id = trs.scan_session_id
     WHERE trs.test_result_id = ? AND trs.link_status = 'selected'
     LIMIT 1`,
    [result.test_result_id],
  ))[0] ?? null;

  let scanSession: V2ScanSessionUpload | null = null;
  if (scan) {
    const detections = rowsToArray<DetectionRow>(database.execute(
      `SELECT
         question_id,
         detected_option,
         confidence_score,
         detection_status,
         verification_status,
         raw_mark,
         detected_at
       FROM omr_detections
       WHERE scan_session_id = ?
       ORDER BY omr_detection_id`,
      [scan.scan_session_id],
    )).map<V2DetectionUpload>(detection => ({
      questionId: detection.question_id,
      itemNumber: questionNumbers.get(detection.question_id) ?? 0,
      detectedOption: detection.detected_option,
      confidenceScore: Number(detection.confidence_score),
      detectionStatus: detection.detection_status,
      verificationStatus: detection.verification_status,
      rawMarkInformation: parseRawMark(detection.raw_mark),
      detectedAt: detection.detected_at,
    }));

    scanSession = {
      scanUuid: scan.scan_uuid,
      templateVersion: scan.template_version,
      scannerVersion: scan.scanner_version,
      imageHash: scan.image_hash,
      scanStatus: 'verified',
      scannedAt: scan.scanned_at,
      verifiedAt: scan.verified_at,
      detections,
    };
  }

  return {
    resultUuid: result.result_uuid,
    syncAction: result.sync_action,
    classListId: result.class_list_id,
    attemptNumber: result.attempt_number,
    checkedAt: result.checked_at,
    scanSession,
    answers,
  };
};

export const prepareV2Upload = async (
  testId: number,
  deviceIdentifier: string,
): Promise<PreparedV2Upload | null> => {
  const database = getV2Database();
  const results = rowsToArray<UnsyncedResultRow>(database.execute(
    `SELECT
       test_result_id,
       result_uuid,
       class_list_id,
       attempt_number,
       checked_at,
       sync_action
     FROM test_results
     WHERE test_id = ?
       AND result_status = 'verified'
       AND is_synced = 0
     ORDER BY test_result_id`,
    [testId],
  ));
  if (results.length === 0) return null;

  const uploadedAt = nowIso();
  const resultUuids = results.map(result => result.result_uuid);
  const retryBatch = findRetryBatch(testId, resultUuids);
  const syncUuid = retryBatch?.sync_uuid ?? createV2Uuid();
  let syncBatchId = retryBatch?.sync_batch_id ?? 0;

  await withV2Transaction(transaction => {
    if (retryBatch) {
      transaction.execute(
        `UPDATE sync_batches
         SET device_identifier = ?,
             uploaded_at = ?,
             sync_status = 'in_progress',
             sync_attempt_count = sync_attempt_count + 1,
             last_sync_error = NULL,
             started_at = ?,
             completed_at = NULL,
             updated_at = ?
         WHERE sync_batch_id = ?`,
        [deviceIdentifier, uploadedAt, uploadedAt, uploadedAt, retryBatch.sync_batch_id],
      );
    } else {
      const insert = transaction.execute(
        `INSERT INTO sync_batches (
           sync_uuid,
           test_id,
           device_identifier,
           uploaded_at,
           sync_status,
           sync_attempt_count,
           started_at,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, 'in_progress', 1, ?, ?, ?)`,
        [syncUuid, testId, deviceIdentifier, uploadedAt, uploadedAt, uploadedAt, uploadedAt],
      );
      syncBatchId = Number(insert.insertId);
    }

    results.forEach(result => {
      transaction.execute(
        `INSERT INTO sync_result_items (
           sync_batch_id,
           result_uuid,
           sync_action,
           sync_status,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(sync_batch_id, result_uuid) DO UPDATE SET
           sync_action = excluded.sync_action,
           sync_status = 'pending',
           error_code = NULL,
           error_message = NULL,
           synced_at = NULL,
           updated_at = excluded.updated_at`,
        [syncBatchId, result.result_uuid, result.sync_action, uploadedAt, uploadedAt],
      );
      transaction.execute(
        `UPDATE test_results
         SET sync_attempt_count = sync_attempt_count + 1,
             last_sync_error = NULL,
             updated_at = ?
         WHERE test_result_id = ?`,
        [uploadedAt, result.test_result_id],
      );
      transaction.execute(
        `UPDATE student_answers
         SET sync_attempt_count = sync_attempt_count + 1,
             last_sync_error = NULL,
             updated_at = ?
         WHERE test_result_id = ?`,
        [uploadedAt, result.test_result_id],
      );
      transaction.execute(
        `UPDATE scan_sessions
         SET sync_attempt_count = sync_attempt_count + 1,
             last_sync_error = NULL,
             updated_at = ?
         WHERE scan_session_id IN (
           SELECT scan_session_id
           FROM test_result_scans
           WHERE test_result_id = ? AND link_status = 'selected'
         )`,
        [uploadedAt, result.test_result_id],
      );
    });
  });

  const questionNumbers = buildQuestionNumberMap(testId);
  return {
    syncBatchId,
    payload: {
      contractVersion: V2_CONTRACT_VERSION,
      syncUuid,
      deviceIdentifier,
      uploadedAt,
      testId,
      results: results.map(result => buildResultUpload(result, questionNumbers)),
    },
  };
};

const markResultFailure = (
  transaction: Transaction,
  resultUuid: string,
  errorMessage: string,
  updatedAt: string,
): void => {
  transaction.execute(
    `UPDATE test_results
     SET is_synced = 0, last_sync_error = ?, updated_at = ?
     WHERE result_uuid = ?`,
    [errorMessage, updatedAt, resultUuid],
  );
  transaction.execute(
    `UPDATE student_answers
     SET is_synced = 0, last_sync_error = ?, updated_at = ?
     WHERE test_result_id IN (SELECT test_result_id FROM test_results WHERE result_uuid = ?)`,
    [errorMessage, updatedAt, resultUuid],
  );
  transaction.execute(
    `UPDATE scan_sessions
     SET is_synced = 0, last_sync_error = ?, updated_at = ?
     WHERE scan_session_id IN (
       SELECT trs.scan_session_id
       FROM test_result_scans trs
       INNER JOIN test_results tr ON tr.test_result_id = trs.test_result_id
       WHERE tr.result_uuid = ? AND trs.link_status = 'selected'
     )`,
    [errorMessage, updatedAt, resultUuid],
  );
};

export const applyV2UploadResponse = async (
  prepared: PreparedV2Upload,
  response: V2UploadResponse,
): Promise<void> => {
  if (response.syncUuid !== prepared.payload.syncUuid || response.testId !== prepared.payload.testId) {
    throw new Error('Upload response identity does not match the submitted batch.');
  }

  const completedAt = response.completedAt || nowIso();
  const responseByResult = new Map(response.items.map(item => [item.resultUuid, item]));

  await withV2Transaction(transaction => {
    transaction.execute(
      `UPDATE sync_batches
       SET sync_status = ?, completed_at = ?, last_sync_error = NULL, updated_at = ?
       WHERE sync_batch_id = ?`,
      [response.status, completedAt, completedAt, prepared.syncBatchId],
    );

    prepared.payload.results.forEach(result => {
      const item = responseByResult.get(result.resultUuid);
      const succeeded = item?.status === 'success';
      const errorCode = item?.errorCode ?? (item ? null : 'MISSING_RESPONSE_ITEM');
      const errorMessage = item?.errorMessage ?? (item ? null : 'Backend did not return this result item.');
      transaction.execute(
        `UPDATE sync_result_items
         SET sync_status = ?,
             central_sync_item_id = ?,
             central_test_result_id = ?,
             central_scan_session_id = ?,
             error_code = ?,
             error_message = ?,
             synced_at = ?,
             updated_at = ?
         WHERE sync_batch_id = ? AND result_uuid = ?`,
        [
          succeeded ? 'success' : 'failed',
          item?.syncItemId ?? null,
          item?.testResultId ?? null,
          item?.scanSessionId ?? null,
          errorCode,
          errorMessage,
          succeeded ? completedAt : null,
          completedAt,
          prepared.syncBatchId,
          result.resultUuid,
        ],
      );

      if (!succeeded) {
        markResultFailure(transaction, result.resultUuid, errorMessage || 'Upload failed.', completedAt);
        return;
      }

      transaction.execute(
        `UPDATE test_results
         SET central_test_result_id = ?,
             sync_action = 'update',
             is_synced = 1,
             last_sync_error = NULL,
             last_synced_at = ?,
             updated_at = ?
         WHERE result_uuid = ?`,
        [item?.testResultId ?? null, completedAt, completedAt, result.resultUuid],
      );
      transaction.execute(
        `UPDATE student_answers
         SET is_synced = 1,
             last_sync_error = NULL,
             last_synced_at = ?,
             updated_at = ?
         WHERE test_result_id IN (SELECT test_result_id FROM test_results WHERE result_uuid = ?)`,
        [completedAt, completedAt, result.resultUuid],
      );
      transaction.execute(
        `UPDATE scan_sessions
         SET is_synced = 1,
             last_sync_error = NULL,
             last_synced_at = ?,
             updated_at = ?
         WHERE scan_session_id IN (
           SELECT trs.scan_session_id
           FROM test_result_scans trs
           INNER JOIN test_results tr ON tr.test_result_id = trs.test_result_id
           WHERE tr.result_uuid = ? AND trs.link_status = 'selected'
         )`,
        [completedAt, completedAt, result.resultUuid],
      );
    });
  });
};

export const markV2UploadFailed = async (
  prepared: PreparedV2Upload,
  errorMessage: string,
): Promise<void> => {
  const failedAt = nowIso();
  await withV2Transaction(transaction => {
    transaction.execute(
      `UPDATE sync_batches
       SET sync_status = 'failed', last_sync_error = ?, completed_at = ?, updated_at = ?
       WHERE sync_batch_id = ?`,
      [errorMessage, failedAt, failedAt, prepared.syncBatchId],
    );
    prepared.payload.results.forEach(result => {
      transaction.execute(
        `UPDATE sync_result_items
         SET sync_status = 'failed',
             error_code = 'UPLOAD_REQUEST_FAILED',
             error_message = ?,
             updated_at = ?
         WHERE sync_batch_id = ? AND result_uuid = ?`,
        [errorMessage, failedAt, prepared.syncBatchId, result.resultUuid],
      );
      markResultFailure(transaction, result.resultUuid, errorMessage, failedAt);
    });
  });
};

export const getLatestV2SyncByAssignment = (teacherId: number): Record<number, string | null> => {
  const rows = rowsToArray<{class_assignment_id: number; last_synced_at: string | null}>(getV2Database().execute(
    `SELECT
       ca.class_assignment_id,
       MAX(tr.last_synced_at) AS last_synced_at
     FROM class_assignments ca
     INNER JOIN tests t ON t.class_assignment_id = ca.class_assignment_id
     LEFT JOIN test_results tr ON tr.test_id = t.test_id AND tr.is_synced = 1
     WHERE ca.user_id = ?
     GROUP BY ca.class_assignment_id`,
    [teacherId],
  ));
  return rows.reduce<Record<number, string | null>>((map, row) => {
    map[row.class_assignment_id] = row.last_synced_at;
    return map;
  }, {});
};

export const normalizeBatchStatus = (status: string): BatchSyncStatus => {
  if (['pending', 'in_progress', 'partial_success', 'success', 'failed'].includes(status)) {
    return status as BatchSyncStatus;
  }
  return 'failed';
};
