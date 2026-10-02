import type {DynamicOmrScanResult} from '../../native/dynamicOmrScanner';
import {createV2Uuid} from '../v2/uuid';
import {getV3Database, v3NowIso, v3RowsToArray} from './database';
import type {V3ObjectiveOfficialScore, V3ObjectiveStudent} from './objectiveRepository';
import type {V3AnswerSheetManifest} from './contracts';

/**
 * Dynamic (mixed-question-type) counterpart of objectiveRepository.ts's outbox.
 * Backs `dynamic_objective_outbox` (schema.ts) - multi-page-aware, and carrying
 * both objective (MC/T-F) detections and written-response (identification/
 * enumeration/essay) answers for one student's result in one row.
 */

export interface V3DynamicWrittenRegion {
  regionUuid: string;
  questionUuid: string;
  questionId: number;
  itemNumber: number;
}

export interface V3DynamicPageRecord {
  pageNumber: number;
  totalPages: number;
  scanPageUuid: string;
  scanSyncUuid: string;
  pageUuid: string;
  qrPayloadHash: string;
  imageUri: string;
  imageHash: string;
  scannerVersion: string;
  capturedAt: string;
  detectionSyncUuid: string;
  detectionOperationUuid: string;
  pageVerificationUuid: string;
  writtenPageVerificationUuid: string;
  uploaded: boolean;
  detectionsUploaded: boolean;
}

export interface V3DynamicObjectiveDetectionRecord {
  detectionUuid: string;
  answerUuid: string;
  verificationUuid: string;
  regionUuid: string;
  questionUuid: string;
  itemNumber: number;
  scanPageUuid: string;
  detectionStatus: 'detected' | 'blank' | 'multiple_marks' | 'uncertain';
  detectedOption: string | null;
  confidence: number;
}

/**
 * Manual: a plain binary Right/Wrong tap, resolved to full/zero points at
 * upload. Used when the question's maximum points weren't known on the phone
 * (and by results saved before `points` existed).
 * Points: the teacher's points for identification/enumeration, or an essay
 * with no rubric - Right/Wrong set full/zero, and partial credit is allowed.
 * Rubric: essay questions with a rubric assigned - mandatory in that case
 * (the backend hard-rejects a Manual submission with RUBRIC_REQUIRED once a
 * question has a rubricId), one explicit score per rubric criterion. Every
 * criterion defined on the rubric needs an entry here, not just the ones
 * marked isRequired - the backend checks the count matches exactly.
 */
export type V3DynamicWrittenScore =
  | {mode: 'manual'; decision: 'correct' | 'incorrect'}
  | {mode: 'points'; points: number}
  | {
      mode: 'rubric';
      rubricId: number;
      criterionScores: Array<{
        rubricCriterionId: number;
        pointsAwarded: number;
        comment: string | null;
      }>;
    };

export interface V3DynamicWrittenAnswerRecord {
  answerUuid: string;
  verificationUuid: string;
  attachmentUuid: string;
  attachmentSyncUuid: string;
  attachmentOperationUuid: string;
  attachmentUploaded: boolean;
  regionUuid: string;
  questionUuid: string;
  itemNumber: number;
  scanPageUuid: string;
  evidenceImageUri: string;
  evidenceSha256: string;
  score: V3DynamicWrittenScore;
}

export type V3DynamicObjectiveStage =
  | 'queued'
  | 'pages_uploaded'
  | 'detections_uploaded'
  | 'verified'
  | 'finalized'
  | 'failed';

export interface V3DynamicObjectiveOutboxRecord {
  resultUuid: string;
  testAssignmentId: number;
  testId: number;
  assignmentUuid: string;
  classListId: number;
  studentId: number;
  scanUuid: string;
  scanSyncUuid: string;
  verificationSyncUuid: string;
  verificationOperationUuid: string;
  // Dedicated to the 3.1 written-verification batch - must differ from
  // verificationSyncUuid/verificationOperationUuid above even though both
  // batches hit the same endpoint, since an operationUuid is an idempotency
  // key and the two batches carry genuinely different content.
  writtenVerificationSyncUuid: string;
  writtenVerificationOperationUuid: string;
  answerSheetUuid: string;
  pages: V3DynamicPageRecord[];
  objectiveDetections: V3DynamicObjectiveDetectionRecord[];
  writtenAnswers: V3DynamicWrittenAnswerRecord[];
  stage: V3DynamicObjectiveStage;
  expectedRevision: number | null;
  centralTestResultId: number | null;
  officialScore: V3ObjectiveOfficialScore | null;
  retryCount: number;
  lastError: string | null;
}

interface WrittenRegionRow {
  region_uuid: string;
  question_uuid: string;
  question_id: number;
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
  scan_sync_uuid: string;
  verification_sync_uuid: string;
  verification_operation_uuid: string;
  written_verification_sync_uuid: string;
  written_verification_operation_uuid: string;
  answer_sheet_uuid: string;
  pages_json: string;
  objective_detections_json: string;
  written_answers_json: string;
  stage: V3DynamicObjectiveStage;
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

// Rows saved before V3DynamicWrittenScore existed stored a bare top-level
// `decision` instead of `score`. Upgrade them on read so a still-unsent row
// from that period can be sent without a rescan.
const parseWrittenAnswers = (value: string): V3DynamicWrittenAnswerRecord[] =>
  (JSON.parse(value) as Array<V3DynamicWrittenAnswerRecord & {decision?: 'correct' | 'incorrect'}>)
    .map(({decision, ...answer}) => (
      answer.score || !decision ? answer : {...answer, score: {mode: 'manual', decision}}
    ));

const mapOutbox = (row: OutboxRow): V3DynamicObjectiveOutboxRecord => ({
  resultUuid: row.result_uuid,
  testAssignmentId: Number(row.test_assignment_id),
  testId: Number(row.test_id),
  assignmentUuid: row.assignment_uuid,
  classListId: Number(row.class_list_id),
  studentId: Number(row.student_id),
  scanUuid: row.scan_uuid,
  scanSyncUuid: row.scan_sync_uuid,
  verificationSyncUuid: row.verification_sync_uuid,
  verificationOperationUuid: row.verification_operation_uuid,
  writtenVerificationSyncUuid: row.written_verification_sync_uuid,
  writtenVerificationOperationUuid: row.written_verification_operation_uuid,
  answerSheetUuid: row.answer_sheet_uuid,
  pages: JSON.parse(row.pages_json) as V3DynamicPageRecord[],
  objectiveDetections: JSON.parse(row.objective_detections_json) as V3DynamicObjectiveDetectionRecord[],
  writtenAnswers: parseWrittenAnswers(row.written_answers_json),
  stage: row.stage,
  expectedRevision: row.expected_revision == null ? null : Number(row.expected_revision),
  centralTestResultId: row.central_test_result_id == null ? null : Number(row.central_test_result_id),
  officialScore: parseScore(row.official_score_json),
  retryCount: Number(row.retry_count),
  lastError: row.last_error,
});

export const getV3DynamicWrittenRegions = (
  testAssignmentId: number,
): V3DynamicWrittenRegion[] => v3RowsToArray<WrittenRegionRow>(getV3Database().execute(
  `SELECT region.region_uuid,
          region.question_uuid,
          region.question_id,
          region.global_item_number
     FROM answer_sheet_versions sheet
     JOIN answer_sheet_regions region
       ON region.answer_sheet_version_id = sheet.answer_sheet_version_id
    WHERE sheet.test_assignment_id = ?
      AND sheet.generation_status = 'ready'
      AND region.region_type = 'written_response'
    ORDER BY region.global_item_number`,
  [testAssignmentId],
)).map(row => ({
  regionUuid: row.region_uuid,
  questionUuid: row.question_uuid,
  questionId: Number(row.question_id),
  itemNumber: Number(row.global_item_number),
}));

export const getV3DynamicObjectiveOutbox = (
  testAssignmentId: number,
  classListId: number,
): V3DynamicObjectiveOutboxRecord | null => {
  const row = v3RowsToArray<OutboxRow>(getV3Database().execute(
    `SELECT * FROM dynamic_objective_outbox
      WHERE test_assignment_id = ? AND class_list_id = ?`,
    [testAssignmentId, classListId],
  ))[0];
  return row ? mapOutbox(row) : null;
};

/** True once any part of this result has reached the backend. */
export const v3DynamicUploadStarted = (record: V3DynamicObjectiveOutboxRecord): boolean =>
  record.stage !== 'queued' || record.pages.some(page => page.uploaded);

/**
 * Replaces a saved result's written-item scores. Only allowed before any part
 * of it has been uploaded: until then the server has never seen this result
 * or its operation UUIDs, so nothing can disagree with the change.
 */
export const updateV3DynamicWrittenScores = (
  resultUuid: string,
  scoresByItemNumber: Record<number, V3DynamicWrittenScore>,
): V3DynamicObjectiveOutboxRecord => {
  const row = v3RowsToArray<OutboxRow>(getV3Database().execute(
    'SELECT * FROM dynamic_objective_outbox WHERE result_uuid = ?',
    [resultUuid],
  ))[0];
  if (!row) throw new Error('This saved result no longer exists on the phone.');
  const record = mapOutbox(row);
  if (v3DynamicUploadStarted(record)) {
    throw new Error('This result has already started uploading, so it can no longer be changed on the phone.');
  }
  const writtenAnswers = record.writtenAnswers.map(answer => {
    const score = scoresByItemNumber[answer.itemNumber];
    if (!score) throw new Error(`Item ${answer.itemNumber} has no score yet.`);
    return {...answer, score};
  });
  getV3Database().execute(
    `UPDATE dynamic_objective_outbox
        SET written_answers_json = ?, updated_at = ?
      WHERE result_uuid = ? AND stage = 'queued'`,
    [JSON.stringify(writtenAnswers), v3NowIso(), resultUuid],
  );
  return {...record, writtenAnswers};
};

/**
 * Discards a saved result so the teacher can rescan from scratch (e.g. the
 * wrong paper was captured). Callers must only offer this before any part of
 * the result has been uploaded (v3DynamicUploadStarted): after that the
 * server already holds a partial copy, and deleting the local row would leave
 * it orphaned there instead of undoing it.
 */
export const deleteV3DynamicObjectiveOutbox = (
  testAssignmentId: number,
  classListId: number,
): void => {
  getV3Database().execute(
    `DELETE FROM dynamic_objective_outbox WHERE test_assignment_id = ? AND class_list_id = ?`,
    [testAssignmentId, classListId],
  );
};

/**
 * Builds and persists one outbox row from every page captured for a dynamic
 * mixed-type sheet, plus the teacher's Right/Wrong decisions for written items.
 * Idempotent per (testAssignmentId, classListId): returns the existing row on a
 * second call rather than creating a duplicate, matching queueV3ObjectiveScan.
 */
export const queueV3DynamicScan = (
  test: {testAssignmentId: number; testId: number; assignmentUuid: string},
  student: V3ObjectiveStudent,
  answerSheetUuid: string,
  objectiveRegions: {regionUuid: string; questionUuid: string; itemNumber: number}[],
  writtenRegions: V3DynamicWrittenRegion[],
  manifest: V3AnswerSheetManifest,
  dynamicPages: DynamicOmrScanResult[],
  writtenScores: Record<number, V3DynamicWrittenScore>,
): V3DynamicObjectiveOutboxRecord => {
  const existing = getV3DynamicObjectiveOutbox(test.testAssignmentId, student.classListId);
  if (existing) return existing;

  const objectiveRegionByItem = new Map(objectiveRegions.map(region => [region.itemNumber, region]));
  const writtenRegionByItem = new Map(writtenRegions.map(region => [region.itemNumber, region]));
  const manifestPageByNumber = new Map(manifest.pages.map(page => [page.pageNumber, page]));

  const pages: V3DynamicPageRecord[] = dynamicPages.map(page => {
    const manifestPage = manifestPageByNumber.get(page.identity.pageNumber);
    if (!manifestPage) {
      throw new Error(`Manifest has no page ${page.identity.pageNumber} to read the QR payload hash from.`);
    }
    return {
      pageNumber: page.identity.pageNumber,
      totalPages: page.identity.totalPages,
      scanPageUuid: createV2Uuid(),
      scanSyncUuid: createV2Uuid(),
      pageUuid: page.identity.pageUuid,
      qrPayloadHash: manifestPage.qr.payloadHash,
      // Fixed here, at queue time: the upload must send exactly these bytes
      // under this hash on every retry, so a queued file is never recompressed.
      ...(page.uploadImageUri && page.uploadImageSha256
        ? {imageUri: page.uploadImageUri, imageHash: page.uploadImageSha256}
        : {imageUri: page.sourceImageUri, imageHash: page.originalPageSha256}),
      scannerVersion: page.scannerVersion,
      capturedAt: v3NowIso(),
      detectionSyncUuid: createV2Uuid(),
      detectionOperationUuid: createV2Uuid(),
      pageVerificationUuid: createV2Uuid(),
      writtenPageVerificationUuid: createV2Uuid(),
      uploaded: false,
      detectionsUploaded: false,
    };
  });
  const scanPageUuidByPageNumber = new Map(pages.map(page => [page.pageNumber, page.scanPageUuid]));

  const objectiveDetections: V3DynamicObjectiveDetectionRecord[] = dynamicPages.flatMap(page => {
    const scanPageUuid = scanPageUuidByPageNumber.get(page.identity.pageNumber)!;
    return page.objectiveDetections.map(detection => {
      const region = objectiveRegionByItem.get(detection.itemNumber);
      if (!region) throw new Error(`Manifest region for item ${detection.itemNumber} is missing.`);
      return {
        detectionUuid: createV2Uuid(),
        answerUuid: createV2Uuid(),
        verificationUuid: createV2Uuid(),
        regionUuid: region.regionUuid,
        questionUuid: region.questionUuid,
        itemNumber: detection.itemNumber,
        scanPageUuid,
        detectionStatus: detection.detectionStatus,
        // detection.detectedOption is the option's storedValue (real answer-choice
        // TEXT for mixed dynamic question banks, e.g. "Paris") - the backend
        // contract's detectedOption is the canonical printed position key
        // ("A"/"B"/"C"/"D"), which is detection.detectedLabel. Same distinction
        // V3ObjectiveWorkflowModal.tsx already accounts for when matching pills.
        detectedOption: detection.detectedLabel,
        confidence: detection.confidenceScore,
      };
    });
  });

  const writtenAnswers: V3DynamicWrittenAnswerRecord[] = dynamicPages.flatMap(page => {
    const scanPageUuid = scanPageUuidByPageNumber.get(page.identity.pageNumber)!;
    return page.writtenEvidence.map(evidence => {
      const region = writtenRegionByItem.get(evidence.itemNumber);
      if (!region) throw new Error(`Manifest region for item ${evidence.itemNumber} is missing.`);
      const score = writtenScores[evidence.itemNumber];
      if (!score) {
        throw new Error(`Item ${evidence.itemNumber} has no score yet.`);
      }
      return {
        answerUuid: createV2Uuid(),
        verificationUuid: createV2Uuid(),
        attachmentUuid: createV2Uuid(),
        attachmentSyncUuid: createV2Uuid(),
        attachmentOperationUuid: createV2Uuid(),
        attachmentUploaded: false,
        regionUuid: region.regionUuid,
        questionUuid: region.questionUuid,
        itemNumber: evidence.itemNumber,
        scanPageUuid,
        // The original crop, not the enhanced preview, is the authoritative
        // evidence file - its own evidenceSha256 must match whichever bytes are
        // actually uploaded, and the architecture doc is explicit that the
        // enhanced version is a display aid only, never authoritative evidence.
        evidenceImageUri: evidence.evidenceImageUri,
        evidenceSha256: evidence.evidenceSha256,
        score,
      };
    });
  });

  const now = v3NowIso();
  const ids = {
    resultUuid: createV2Uuid(),
    scanUuid: createV2Uuid(),
    scanSyncUuid: createV2Uuid(),
    verificationSyncUuid: createV2Uuid(),
    verificationOperationUuid: createV2Uuid(),
    writtenVerificationSyncUuid: createV2Uuid(),
    writtenVerificationOperationUuid: createV2Uuid(),
  };
  getV3Database().execute(
    `INSERT INTO dynamic_objective_outbox (
       result_uuid, test_assignment_id, test_id, assignment_uuid,
       class_list_id, student_id, scan_uuid, scan_sync_uuid,
       verification_sync_uuid, verification_operation_uuid,
       written_verification_sync_uuid, written_verification_operation_uuid,
       answer_sheet_uuid,
       pages_json, objective_detections_json, written_answers_json,
       stage, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [
      ids.resultUuid, test.testAssignmentId, test.testId, test.assignmentUuid,
      student.classListId, student.studentId, ids.scanUuid, ids.scanSyncUuid,
      ids.verificationSyncUuid, ids.verificationOperationUuid,
      ids.writtenVerificationSyncUuid, ids.writtenVerificationOperationUuid,
      answerSheetUuid,
      JSON.stringify(pages), JSON.stringify(objectiveDetections), JSON.stringify(writtenAnswers),
      now, now,
    ],
  );
  return getV3DynamicObjectiveOutbox(test.testAssignmentId, student.classListId)!;
};

/** Marks one page within an outbox row's pages_json as uploaded/detections-uploaded. */
export const updateV3DynamicPage = (
  resultUuid: string,
  pageNumber: number,
  patch: Partial<{uploaded: boolean; detectionsUploaded: boolean}>,
): void => {
  const row = v3RowsToArray<{pages_json: string}>(getV3Database().execute(
    'SELECT pages_json FROM dynamic_objective_outbox WHERE result_uuid = ?',
    [resultUuid],
  ))[0];
  if (!row) return;
  const pages = (JSON.parse(row.pages_json) as V3DynamicPageRecord[]).map(page =>
    page.pageNumber === pageNumber ? {...page, ...patch} : page,
  );
  getV3Database().execute(
    'UPDATE dynamic_objective_outbox SET pages_json = ?, updated_at = ? WHERE result_uuid = ?',
    [JSON.stringify(pages), v3NowIso(), resultUuid],
  );
};

/** Marks one written answer within an outbox row's written_answers_json as
 * having had its evidence attachment uploaded. */
export const updateV3DynamicWrittenAnswer = (
  resultUuid: string,
  answerUuid: string,
  patch: Partial<{attachmentUploaded: boolean}>,
): void => {
  const row = v3RowsToArray<{written_answers_json: string}>(getV3Database().execute(
    'SELECT written_answers_json FROM dynamic_objective_outbox WHERE result_uuid = ?',
    [resultUuid],
  ))[0];
  if (!row) return;
  const answers = (JSON.parse(row.written_answers_json) as V3DynamicWrittenAnswerRecord[]).map(answer =>
    answer.answerUuid === answerUuid ? {...answer, ...patch} : answer,
  );
  getV3Database().execute(
    'UPDATE dynamic_objective_outbox SET written_answers_json = ?, updated_at = ? WHERE result_uuid = ?',
    [JSON.stringify(answers), v3NowIso(), resultUuid],
  );
};

export const updateV3DynamicObjectiveOutbox = (
  resultUuid: string,
  patch: Partial<{
    stage: V3DynamicObjectiveStage;
    expectedRevision: number | null;
    centralTestResultId: number | null;
    officialScore: V3ObjectiveOfficialScore | null;
    analytics: unknown;
    lastError: string | null;
    incrementRetry: boolean;
    // Only ever set together with expectedRevision, when the sync service
    // reconciles a REVISION_CONFLICT: the backend's "submit a new operation"
    // instruction means the old operationUuid can never succeed again (its
    // idempotency hash is pinned to a request built against a now-stale
    // revision), so a fresh pair is minted and persisted here rather than
    // requiring another manual DB patch for the next student this happens to.
    verificationSyncUuid: string;
    verificationOperationUuid: string;
    writtenVerificationSyncUuid: string;
    writtenVerificationOperationUuid: string;
  }>,
): void => {
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [v3NowIso()];
  if (patch.stage !== undefined) { sets.push('stage = ?'); values.push(patch.stage); }
  if (patch.expectedRevision !== undefined) { sets.push('expected_revision = ?'); values.push(patch.expectedRevision); }
  if (patch.centralTestResultId !== undefined) { sets.push('central_test_result_id = ?'); values.push(patch.centralTestResultId); }
  if (patch.verificationSyncUuid !== undefined) { sets.push('verification_sync_uuid = ?'); values.push(patch.verificationSyncUuid); }
  if (patch.verificationOperationUuid !== undefined) { sets.push('verification_operation_uuid = ?'); values.push(patch.verificationOperationUuid); }
  if (patch.writtenVerificationSyncUuid !== undefined) { sets.push('written_verification_sync_uuid = ?'); values.push(patch.writtenVerificationSyncUuid); }
  if (patch.writtenVerificationOperationUuid !== undefined) { sets.push('written_verification_operation_uuid = ?'); values.push(patch.writtenVerificationOperationUuid); }
  if (patch.officialScore !== undefined) {
    sets.push('official_score_json = ?');
    values.push(patch.officialScore ? JSON.stringify(patch.officialScore) : null);
  }
  if (patch.analytics !== undefined) {
    sets.push('analytics_json = ?');
    values.push(patch.analytics ? JSON.stringify(patch.analytics) : null);
  }
  if (patch.lastError !== undefined) { sets.push('last_error = ?'); values.push(patch.lastError); }
  if (patch.incrementRetry) { sets.push('retry_count = retry_count + 1'); }
  values.push(resultUuid);
  getV3Database().execute(
    `UPDATE dynamic_objective_outbox SET ${sets.join(', ')} WHERE result_uuid = ?`,
    values,
  );
};
