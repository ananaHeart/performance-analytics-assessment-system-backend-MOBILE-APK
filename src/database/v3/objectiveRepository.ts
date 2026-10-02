import type {OmrScanResult} from '../../native/omrScanner';
import {createV2Uuid} from '../v2/uuid';
import {getV3Database, v3NowIso, v3RowsToArray} from './database';

export interface V3ObjectiveStudent {
  studentId: number;
  classListId: number;
  studentLrn: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  // Coalesced from either objective_outbox (fixed template) or
  // dynamic_objective_outbox (dynamic template) - only one is ever populated
  // for a given assignment, but their stage enums differ, so this is a plain
  // string rather than the narrower V3ObjectiveStage used by the fixed flow's
  // own outbox functions.
  operationStage: string | null;
  resultUuid: string | null;
  officialScore: V3ObjectiveOfficialScore | null;
}

export interface V3ObjectiveCaptureContext {
  answerSheetUuid: string;
  pageUuid: string;
  pageNumber: number;
  qrPayloadHash: string;
  templateCode: string;
  templateVersion: string;
  totalQuestions: number;
  totalPages: number;
}

export interface V3ObjectiveRegion {
  regionUuid: string;
  questionUuid: string;
  itemNumber: number;
}

export type V3ObjectiveStage =
  | 'queued'
  | 'scan_uploaded'
  | 'detections_uploaded'
  | 'verified'
  | 'finalized'
  | 'failed';

export interface V3ObjectiveOfficialScore {
  totalScore: number;
  maxScore: number;
  percentage: number;
  performanceStatus: string;
  performanceLabel: string;
  resultStatus: string;
}

export interface V3QueuedDetection {
  detectionUuid: string;
  answerUuid: string;
  verificationUuid: string;
  regionUuid: string;
  questionUuid: string;
  itemNumber: number;
  detectionStatus: 'detected' | 'blank' | 'multiple_marks' | 'uncertain';
  detectedOption: string | null;
  confidence: number;
}

export interface V3ObjectiveOutboxRecord {
  resultUuid: string;
  testAssignmentId: number;
  testId: number;
  assignmentUuid: string;
  classListId: number;
  studentId: number;
  scanUuid: string;
  scanPageUuid: string;
  scanSyncUuid: string;
  detectionSyncUuid: string;
  detectionOperationUuid: string;
  verificationSyncUuid: string;
  verificationOperationUuid: string;
  pageVerificationUuid: string;
  answerSheetUuid: string;
  pageUuid: string;
  qrPayloadHash: string;
  imageUri: string;
  imageHash: string;
  scannerVersion: string;
  capturedAt: string;
  detections: V3QueuedDetection[];
  stage: V3ObjectiveStage;
  expectedRevision: number | null;
  centralTestResultId: number | null;
  officialScore: V3ObjectiveOfficialScore | null;
  retryCount: number;
  lastError: string | null;
}

interface StudentRow {
  student_id: number;
  class_list_id: number;
  student_lrn: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  stage: string | null;
  result_uuid: string | null;
  official_score_json: string | null;
}

interface CaptureRow {
  answer_sheet_uuid: string;
  page_uuid: string;
  page_number: number;
  qr_payload_hash: string;
  template_code: string;
  template_version: string;
  total_questions: number;
  total_pages: number;
}

interface RegionRow {
  region_uuid: string;
  question_uuid: string;
  global_item_number: number;
}

interface OutboxRow {
  result_uuid: string;
  test_assignment_id: number;
  test_id: number;
  assignment_uuid: string;
  class_list_id: number;
  student_id: number;
  scan_uuid: string;
  scan_page_uuid: string;
  scan_sync_uuid: string;
  detection_sync_uuid: string;
  detection_operation_uuid: string;
  verification_sync_uuid: string;
  verification_operation_uuid: string;
  page_verification_uuid: string;
  answer_sheet_uuid: string;
  page_uuid: string;
  qr_payload_hash: string;
  image_uri: string;
  image_hash: string;
  scanner_version: string;
  captured_at: string;
  detections_json: string;
  stage: V3ObjectiveStage;
  expected_revision: number | null;
  central_test_result_id: number | null;
  official_score_json: string | null;
  retry_count: number;
  last_error: string | null;
}

const parseScore = (value: string | null): V3ObjectiveOfficialScore | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as V3ObjectiveOfficialScore;
  } catch {
    return null;
  }
};

export const getV3ObjectiveStudents = (
  testAssignmentId: number,
  classId: number,
): V3ObjectiveStudent[] => v3RowsToArray<StudentRow>(getV3Database().execute(
  `SELECT student.student_id,
          class_list.class_list_id,
          student.student_lrn,
          student.first_name,
          student.middle_name,
          student.last_name,
          student.suffix,
          COALESCE(outbox.stage, dynamic_outbox.stage) AS stage,
          COALESCE(outbox.result_uuid, dynamic_outbox.result_uuid) AS result_uuid,
          COALESCE(outbox.official_score_json, dynamic_outbox.official_score_json) AS official_score_json
     FROM class_lists class_list
     JOIN students student ON student.student_id = class_list.student_id
     LEFT JOIN objective_outbox outbox
       ON outbox.test_assignment_id = ?
      AND outbox.class_list_id = class_list.class_list_id
     LEFT JOIN dynamic_objective_outbox dynamic_outbox
       ON dynamic_outbox.test_assignment_id = ?
      AND dynamic_outbox.class_list_id = class_list.class_list_id
    WHERE class_list.class_id = ?
      AND class_list.enrollment_status = 'enrolled'
    ORDER BY student.last_name COLLATE NOCASE, student.first_name COLLATE NOCASE, student.student_id`,
  [testAssignmentId, testAssignmentId, classId],
)).map(row => ({
  studentId: Number(row.student_id),
  classListId: Number(row.class_list_id),
  studentLrn: row.student_lrn,
  firstName: row.first_name,
  middleName: row.middle_name,
  lastName: row.last_name,
  suffix: row.suffix,
  operationStage: row.stage,
  resultUuid: row.result_uuid,
  officialScore: parseScore(row.official_score_json),
}));

export const getV3ObjectiveCaptureContext = (
  testAssignmentId: number,
): V3ObjectiveCaptureContext | null => {
  const row = v3RowsToArray<CaptureRow>(getV3Database().execute(
    `SELECT sheet.answer_sheet_uuid,
            page.page_uuid,
            page.page_number,
            page.qr_payload_hash,
            template.template_code,
            page.template_version,
            sheet.total_questions,
            sheet.total_pages
       FROM answer_sheet_versions sheet
       JOIN answer_sheet_pages page
         ON page.answer_sheet_version_id = sheet.answer_sheet_version_id
       JOIN omr_templates template
         ON template.omr_template_id = page.omr_template_id
      WHERE sheet.test_assignment_id = ?
        AND sheet.generation_status = 'ready'
        AND page.page_status = 'ready'
        AND page.page_number = 1
      ORDER BY sheet.generation_number DESC
      LIMIT 1`,
    [testAssignmentId],
  ))[0];
  return row ? {
    answerSheetUuid: row.answer_sheet_uuid,
    pageUuid: row.page_uuid,
    pageNumber: Number(row.page_number),
    qrPayloadHash: row.qr_payload_hash,
    templateCode: row.template_code,
    templateVersion: row.template_version,
    totalQuestions: Number(row.total_questions),
    totalPages: Number(row.total_pages),
  } : null;
};

export const getV3ObjectiveRegions = (
  testAssignmentId: number,
): V3ObjectiveRegion[] => v3RowsToArray<RegionRow>(getV3Database().execute(
  `SELECT region.region_uuid,
          region.question_uuid,
          region.global_item_number
     FROM answer_sheet_versions sheet
     JOIN answer_sheet_regions region
       ON region.answer_sheet_version_id = sheet.answer_sheet_version_id
    WHERE sheet.test_assignment_id = ?
      AND sheet.generation_status = 'ready'
      AND region.region_type = 'objective_bubbles'
    ORDER BY region.global_item_number`,
  [testAssignmentId],
)).map(row => ({
  regionUuid: row.region_uuid,
  questionUuid: row.question_uuid,
  itemNumber: Number(row.global_item_number),
}));

const mapOutbox = (row: OutboxRow): V3ObjectiveOutboxRecord => ({
  resultUuid: row.result_uuid,
  testAssignmentId: Number(row.test_assignment_id),
  testId: Number(row.test_id),
  assignmentUuid: row.assignment_uuid,
  classListId: Number(row.class_list_id),
  studentId: Number(row.student_id),
  scanUuid: row.scan_uuid,
  scanPageUuid: row.scan_page_uuid,
  scanSyncUuid: row.scan_sync_uuid,
  detectionSyncUuid: row.detection_sync_uuid,
  detectionOperationUuid: row.detection_operation_uuid,
  verificationSyncUuid: row.verification_sync_uuid,
  verificationOperationUuid: row.verification_operation_uuid,
  pageVerificationUuid: row.page_verification_uuid,
  answerSheetUuid: row.answer_sheet_uuid,
  pageUuid: row.page_uuid,
  qrPayloadHash: row.qr_payload_hash,
  imageUri: row.image_uri,
  imageHash: row.image_hash,
  scannerVersion: row.scanner_version,
  capturedAt: row.captured_at,
  detections: JSON.parse(row.detections_json) as V3QueuedDetection[],
  stage: row.stage,
  expectedRevision: row.expected_revision == null ? null : Number(row.expected_revision),
  centralTestResultId: row.central_test_result_id == null ? null : Number(row.central_test_result_id),
  officialScore: parseScore(row.official_score_json),
  retryCount: Number(row.retry_count),
  lastError: row.last_error,
});

export const getV3ObjectiveOutbox = (
  testAssignmentId: number,
  classListId: number,
): V3ObjectiveOutboxRecord | null => {
  const row = v3RowsToArray<OutboxRow>(getV3Database().execute(
    `SELECT * FROM objective_outbox
      WHERE test_assignment_id = ? AND class_list_id = ?`,
    [testAssignmentId, classListId],
  ))[0];
  return row ? mapOutbox(row) : null;
};

/**
 * Discards a not-yet-finalized queued result so the teacher can rescan from
 * scratch (e.g. the wrong paper was captured/checked). Only ever called while
 * `officialScore` is still null - once the backend has finalized a result,
 * discarding the local row would desync from that authoritative record rather
 * than undo it; that case needs the backend's reopen/correction workflow, not
 * a local delete.
 */
export const deleteV3ObjectiveOutbox = (
  testAssignmentId: number,
  classListId: number,
): void => {
  getV3Database().execute(
    `DELETE FROM objective_outbox WHERE test_assignment_id = ? AND class_list_id = ?`,
    [testAssignmentId, classListId],
  );
};

export const queueV3ObjectiveScan = (
  test: {testAssignmentId: number; testId: number; assignmentUuid: string},
  student: V3ObjectiveStudent,
  context: V3ObjectiveCaptureContext,
  regions: V3ObjectiveRegion[],
  scan: OmrScanResult,
): V3ObjectiveOutboxRecord => {
  const existing = getV3ObjectiveOutbox(test.testAssignmentId, student.classListId);
  if (existing) return existing;
  const regionByItem = new Map(regions.map(region => [region.itemNumber, region]));
  const detections: V3QueuedDetection[] = scan.detections.map(detection => {
    const region = regionByItem.get(detection.itemNumber);
    if (!region) throw new Error(`Manifest region for item ${detection.itemNumber} is missing.`);
    return {
      detectionUuid: createV2Uuid(),
      answerUuid: createV2Uuid(),
      verificationUuid: createV2Uuid(),
      regionUuid: region.regionUuid,
      questionUuid: region.questionUuid,
      itemNumber: detection.itemNumber,
      detectionStatus: detection.detectionStatus,
      detectedOption: detection.detectedOption,
      confidence: detection.confidenceScore,
    };
  });
  const now = v3NowIso();
  const ids = {
    resultUuid: createV2Uuid(),
    scanUuid: createV2Uuid(),
    scanPageUuid: createV2Uuid(),
    scanSyncUuid: createV2Uuid(),
    detectionSyncUuid: createV2Uuid(),
    detectionOperationUuid: createV2Uuid(),
    verificationSyncUuid: createV2Uuid(),
    verificationOperationUuid: createV2Uuid(),
    pageVerificationUuid: createV2Uuid(),
  };
  getV3Database().execute(
    `INSERT INTO objective_outbox (
       result_uuid, test_assignment_id, test_id, assignment_uuid,
       class_list_id, student_id, scan_uuid, scan_page_uuid, scan_sync_uuid,
       detection_sync_uuid, detection_operation_uuid, verification_sync_uuid,
       verification_operation_uuid, page_verification_uuid, answer_sheet_uuid,
       page_uuid, qr_payload_hash, image_uri, image_hash, scanner_version,
       captured_at, detections_json, stage, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [
      ids.resultUuid, test.testAssignmentId, test.testId, test.assignmentUuid,
      student.classListId, student.studentId, ids.scanUuid, ids.scanPageUuid,
      ids.scanSyncUuid, ids.detectionSyncUuid, ids.detectionOperationUuid,
      ids.verificationSyncUuid, ids.verificationOperationUuid,
      ids.pageVerificationUuid, context.answerSheetUuid, context.pageUuid,
      context.qrPayloadHash, scan.sourceImageUri, scan.imageHash,
      scan.scannerVersion, now, JSON.stringify(detections), now, now,
    ],
  );
  return getV3ObjectiveOutbox(test.testAssignmentId, student.classListId)!;
};

export const updateV3ObjectiveOutbox = (
  resultUuid: string,
  update: {
    stage: V3ObjectiveStage;
    expectedRevision?: number | null;
    centralTestResultId?: number | null;
    officialScore?: V3ObjectiveOfficialScore | null;
    analytics?: Record<string, unknown> | null;
    lastError?: string | null;
    incrementRetry?: boolean;
  },
): void => {
  getV3Database().execute(
    `UPDATE objective_outbox
        SET stage = ?,
            expected_revision = COALESCE(?, expected_revision),
            central_test_result_id = COALESCE(?, central_test_result_id),
            official_score_json = COALESCE(?, official_score_json),
            analytics_json = COALESCE(?, analytics_json),
            retry_count = retry_count + ?,
            last_error = ?,
            updated_at = ?
      WHERE result_uuid = ?`,
    [
      update.stage,
      update.expectedRevision ?? null,
      update.centralTestResultId ?? null,
      update.officialScore ? JSON.stringify(update.officialScore) : null,
      update.analytics ? JSON.stringify(update.analytics) : null,
      update.incrementRetry ? 1 : 0,
      update.lastError ?? null,
      v3NowIso(),
      resultUuid,
    ],
  );
};
