import {
  getV3ObjectiveOutbox,
  updateV3ObjectiveOutbox,
  type V3ObjectiveOfficialScore,
  type V3ObjectiveOutboxRecord,
} from '../../database/v3/objectiveRepository';
import {
  createV3ObjectiveClient,
  type V3DetectionBatchRequest,
  type V3ScanPageMetadata,
  type V3VerificationBatchRequest,
} from './objectiveClient';

export interface V3ObjectiveSyncResult {
  record: V3ObjectiveOutboxRecord;
  officialScore: V3ObjectiveOfficialScore;
}

// See dynamicObjectiveSyncService.ts's identical constant for why this exists:
// some backend error codes read like an access/auth problem when they're
// really a different, legitimate rule (a schedule restriction, here).
const CONFUSING_ERROR_MESSAGES: Record<string, string> = {
  // Scanning/capture and the local "queued" save never touch the backend at
  // all - this code only ever comes back from a backend call in this sync
  // function, which only runs when you tap "Send". So it's specifically the
  // upload/submission that's blocked, not scanning.
  CAPTURE_NOT_ALLOWED:
    'Already saved on this phone - only the backend upload is blocked, because '
    + "this assignment isn't open for submission yet (check its scheduled "
    + 'open/close time or status). This is a scheduling rule, not a permission '
    + 'or app problem.',
};
const friendlyErrorMessage = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as {code: unknown}).code;
  return typeof code === 'string' ? CONFUSING_ERROR_MESSAGES[code] ?? null : null;
};

export const syncV3ObjectiveResult = async (
  baseUrl: string,
  accessToken: string,
  record: V3ObjectiveOutboxRecord,
): Promise<V3ObjectiveSyncResult> => {
  const client = createV3ObjectiveClient(baseUrl, accessToken);
  let current = record;
  try {
    if (current.stage === 'queued') {
      const metadata: V3ScanPageMetadata = {
        contractVersion: '3.0',
        syncUuid: current.scanSyncUuid,
        resultUuid: current.resultUuid,
        scanUuid: current.scanUuid,
        scanPageUuid: current.scanPageUuid,
        answerSheetUuid: current.answerSheetUuid,
        pageUuid: current.pageUuid,
        assignmentUuid: current.assignmentUuid,
        classListId: current.classListId,
        pageNumber: 1,
        captureNumber: 1,
        scannerVersion: current.scannerVersion,
        qrPayloadHash: current.qrPayloadHash,
        imageHash: current.imageHash,
        capturedAt: current.capturedAt,
      };
      await client.uploadScanPage(metadata, current.imageUri);
      updateV3ObjectiveOutbox(current.resultUuid, {stage: 'scan_uploaded'});
      current = getV3ObjectiveOutbox(current.testAssignmentId, current.classListId)!;
    }

    if (current.stage === 'scan_uploaded') {
      const request: V3DetectionBatchRequest = {
        contractVersion: '3.0',
        syncUuid: current.detectionSyncUuid,
        operationUuid: current.detectionOperationUuid,
        detections: current.detections.map(detection => ({
          detectionUuid: detection.detectionUuid,
          regionUuid: detection.regionUuid,
          questionUuid: detection.questionUuid,
          detectionStatus: detection.detectionStatus,
          detectedOption: detection.detectionStatus === 'detected'
            ? detection.detectedOption
            : null,
          confidence: detection.confidence,
        })),
      };
      const response = await client.uploadDetections(current.scanPageUuid, request);
      updateV3ObjectiveOutbox(current.resultUuid, {
        stage: 'detections_uploaded',
        expectedRevision: response.revision,
      });
      current = getV3ObjectiveOutbox(current.testAssignmentId, current.classListId)!;
    }

    if (current.stage === 'detections_uploaded') {
      if (current.expectedRevision == null) {
        throw new Error('The detection acknowledgement did not provide a result revision.');
      }
      const decidedAt = current.capturedAt;
      const request: V3VerificationBatchRequest = {
        contractVersion: '3.0',
        syncUuid: current.verificationSyncUuid,
        operationUuid: current.verificationOperationUuid,
        assignmentUuid: current.assignmentUuid,
        items: [{
          resultUuid: current.resultUuid,
          expectedRevision: current.expectedRevision,
          pageDecisions: [{
            verificationUuid: current.pageVerificationUuid,
            scanPageUuid: current.scanPageUuid,
            action: 'accepted',
            reasonCode: null,
            comment: null,
            clientDecidedAt: decidedAt,
          }],
          // The backend now accepts an 'uncertain'/'multiple_marks' detection
          // through objective verification directly (it records the ambiguous
          // status faithfully - no option gets picked on the student's behalf -
          // and scores it as zero, same as blank). Every detection is sent; none
          // are held back pending a rescan.
          answers: current.detections
            .map(detection => ({
              answerUuid: detection.answerUuid,
              verificationUuid: detection.verificationUuid,
              questionUuid: detection.questionUuid,
              regionUuid: detection.regionUuid,
              scanPageUuid: current.scanPageUuid,
              evaluation: {kind: 'objective', detectionUuid: detection.detectionUuid},
              comment: null,
              clientDecidedAt: decidedAt,
            })),
        }],
      };
      const response = await client.verify(request);
      const outcome = response.items.find(item => item.resultUuid === current.resultUuid);
      if (!outcome || outcome.status !== 'success' || outcome.revision == null) {
        const error = outcome?.error;
        throw new Error(error
          ? `${error.code}: ${error.message}`
          : 'Backend did not accept the teacher verification item.');
      }
      const readback = await client.getResult(current.resultUuid);
      updateV3ObjectiveOutbox(current.resultUuid, {
        stage: 'verified',
        expectedRevision: outcome.revision,
        centralTestResultId: readback.testResultId,
      });
      current = getV3ObjectiveOutbox(current.testAssignmentId, current.classListId)!;
    }

    if (current.stage === 'verified') {
      const readback = await client.getResult(current.resultUuid);
      const testResultId = current.centralTestResultId ?? readback.testResultId;
      await client.finalize(testResultId);
      const finalized = await client.getResult(current.resultUuid);
      if (finalized.resultStatus !== 'finalized' || !finalized.officialScore) {
        throw new Error(
          `Backend finalization returned ${finalized.resultStatus} without an official score.`,
        );
      }
      const analytics = await client.getAnalytics(current.resultUuid);
      updateV3ObjectiveOutbox(current.resultUuid, {
        stage: 'finalized',
        centralTestResultId: finalized.testResultId,
        expectedRevision: finalized.revision,
        officialScore: finalized.officialScore,
        analytics,
      });
      current = getV3ObjectiveOutbox(current.testAssignmentId, current.classListId)!;
    }

    if (!current.officialScore) {
      throw new Error('The finalized operation has no authoritative backend score.');
    }
    return {record: current, officialScore: current.officialScore};
  } catch (error) {
    const message = friendlyErrorMessage(error) ?? (error instanceof Error ? error.message : 'V3 objective sync failed.');
    updateV3ObjectiveOutbox(current.resultUuid, {
      stage: current.stage,
      lastError: message,
      incrementRetry: true,
    });
    throw error;
  }
};
