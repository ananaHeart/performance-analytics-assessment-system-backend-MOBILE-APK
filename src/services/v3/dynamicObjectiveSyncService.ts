import {
  updateV3DynamicObjectiveOutbox,
  updateV3DynamicPage,
  updateV3DynamicWrittenAnswer,
  getV3DynamicObjectiveOutbox,
  type V3DynamicObjectiveOutboxRecord,
} from '../../database/v3/dynamicObjectiveRepository';
import {createV2Uuid} from '../../database/v2/uuid';
import type {V3ObjectiveOfficialScore} from '../../database/v3/objectiveRepository';
import {
  createV3ObjectiveClient,
  V3ObjectiveHttpError,
  type V3DetectionBatchRequest,
  type V3ScanPageMetadata,
  type V3VerificationBatchRequest,
} from './objectiveClient';
import {createV3WrittenEvidenceClient} from './writtenEvidenceClient';
import {
  createV3DynamicVerificationClient,
  V3DynamicVerificationHttpError,
  type V3WrittenAnswer,
} from './dynamicVerificationClient';
import {getLocalFileSize as fileSizeBytes} from '../../native/omrScanner';

export interface V3DynamicObjectiveSyncResult {
  record: V3DynamicObjectiveOutboxRecord;
  officialScore: V3ObjectiveOfficialScore;
}

// How many times to reconcile-and-retry a REVISION_CONFLICT/
// VERIFICATION_IDENTITY_CONFLICT before giving up. Each attempt is safe to
// repeat as many times as needed - it mints a fresh operationUuid off a freshly
// read revision, so there's no risk of a duplicate or corrupted submission no
// matter how many times it retries. The cap only exists to stop retrying
// forever against something that will never succeed (e.g. genuinely offline);
// it was previously 5, which real testing against a backend that kept
// restarting mid-sync showed was too easy to exhaust on legitimate transient
// hiccups, forcing a manual retry the teacher had to notice and trigger again.
const MAX_RECONCILE_ATTEMPTS = 20;

// The backend's raw message for some error codes reads like an access/auth
// problem when it's really a different, legitimate rule (e.g. a schedule
// restriction) - teachers reading "no permission" on those assume something
// is broken on the app/account rather than "this hasn't opened yet." Maps
// the handful of codes known to cause that confusion to a clearer message,
// covering every V3 HTTP client's error type (they all share the same
// `code: string | null` shape without a common base class to import once).
const CONFUSING_ERROR_MESSAGES: Record<string, string> = {
  // Scanning/capture and the local "queued" save never touch the backend at
  // all - this code only ever comes back from the very first backend call in
  // this sync function (uploadScanPage), which only runs when you tap "Send".
  // So it's specifically the upload/submission that's blocked, not scanning.
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

/**
 * Uploads and finalizes a dynamic (mixed-question-type) multi-page result:
 * every captured page's image, its objective (MC/T-F) detections, the teacher's
 * page-acceptance + objective-answer verification (contract 3.0), the written-
 * response evidence attachments (`teacher_evidence`) and their Right/Wrong
 * verification (contract 3.1, Manual evaluation only - never Rubric, per
 * adviser guidance), then finalize and read back the official score.
 *
 * Mirrors objectiveSyncService.ts's stage-resumable design: each stage is safe
 * to retry because every identifier (sync/operation/attachment UUIDs) is fixed
 * at queue time and never regenerated, so a retried call after a partial
 * failure replays rather than duplicates.
 */
export const syncV3DynamicObjectiveResult = async (
  baseUrl: string,
  accessToken: string,
  record: V3DynamicObjectiveOutboxRecord,
): Promise<V3DynamicObjectiveSyncResult> => {
  const objectiveClient = createV3ObjectiveClient(baseUrl, accessToken);
  const evidenceClient = createV3WrittenEvidenceClient(baseUrl, accessToken);
  const verificationClient = createV3DynamicVerificationClient(baseUrl, accessToken);
  let current = record;

  const reload = () => {
    const next = getV3DynamicObjectiveOutbox(current.testAssignmentId, current.classListId);
    if (!next) throw new Error('The dynamic V3 outbox record disappeared during sync.');
    current = next;
  };

  try {
    if (current.stage === 'queued') {
      for (const page of current.pages) {
        if (page.uploaded) continue;
        const metadata: V3ScanPageMetadata = {
          contractVersion: '3.0',
          syncUuid: page.scanSyncUuid,
          resultUuid: current.resultUuid,
          scanUuid: current.scanUuid,
          scanPageUuid: page.scanPageUuid,
          answerSheetUuid: current.answerSheetUuid,
          pageUuid: page.pageUuid,
          assignmentUuid: current.assignmentUuid,
          classListId: current.classListId,
          pageNumber: page.pageNumber,
          captureNumber: 1,
          scannerVersion: page.scannerVersion,
          qrPayloadHash: page.qrPayloadHash,
          imageHash: page.imageHash,
          capturedAt: page.capturedAt,
        };
        await objectiveClient.uploadScanPage(metadata, page.imageUri);
        updateV3DynamicPage(current.resultUuid, page.pageNumber, {uploaded: true});
      }
      updateV3DynamicObjectiveOutbox(current.resultUuid, {stage: 'pages_uploaded'});
      reload();
    }

    if (current.stage === 'pages_uploaded') {
      let lastRevision: number | null = current.expectedRevision;
      for (const page of current.pages) {
        if (page.detectionsUploaded) continue;
        const pageDetections = current.objectiveDetections.filter(
          detection => detection.scanPageUuid === page.scanPageUuid,
        );
        if (pageDetections.length > 0) {
          const request: V3DetectionBatchRequest = {
            contractVersion: '3.0',
            syncUuid: page.detectionSyncUuid,
            operationUuid: page.detectionOperationUuid,
            detections: pageDetections.map(detection => ({
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
          const response = await objectiveClient.uploadDetections(page.scanPageUuid, request);
          lastRevision = response.revision;
        }
        updateV3DynamicPage(current.resultUuid, page.pageNumber, {detectionsUploaded: true});
      }
      updateV3DynamicObjectiveOutbox(current.resultUuid, {
        stage: 'detections_uploaded',
        expectedRevision: lastRevision,
      });
      reload();
    }

    if (current.stage === 'detections_uploaded') {
      if (current.expectedRevision == null) {
        throw new Error('The detection acknowledgement did not provide a result revision.');
      }
      // Frozen, not regenerated: the backend's idempotency check requires a
      // retried request under the same operationUuid to be byte-for-byte
      // identical to its first submission. objectiveSyncService.ts already
      // gets this right by reusing current.capturedAt; this path used to call
      // new Date().toISOString() fresh on every sync attempt instead, so any
      // retry after a partial failure (e.g. evidence upload succeeds, written
      // verification fails) silently changed clientDecidedAt on the next
      // attempt and got rejected as "bound to different content" even though
      // nothing about the actual answers had changed. pages[0].capturedAt is
      // already fixed once at queue time, same as every other identifier here,
      // and never changes across the reconciliation retries below.
      const decidedAt = current.pages[0].capturedAt;
      const alreadyAcceptedCodes = new Set(['PAGE_DECISION_LOCKED', 'ANSWER_ALREADY_VERIFIED']);

      // REVISION_CONFLICT means the backend's revision moved on (typically a
      // prior attempt actually succeeded server-side but this outbox row never
      // heard back, e.g. a later step in that same attempt failed first) and
      // explicitly requires "a new operation" - the old operationUuid's
      // idempotency hash is permanently pinned to a request built against the
      // stale revision, so no amount of retrying under it can ever succeed
      // again. Mint a fresh pair from the real current revision and persist it
      // immediately, so this heals itself instead of needing a manual DB patch
      // for every student this happens to.
      // Both codes mean the same thing from the client's perspective - this
      // operationUuid can never succeed again as-is and a fresh one is needed
      // alongside the server's real current revision: REVISION_CONFLICT when
      // the local expectedRevision is stale, VERIFICATION_IDENTITY_CONFLICT
      // when the operationUuid was already registered under different content
      // (e.g. an earlier attempt under this same UUID that used a now-stale
      // revision, which is itself often the direct result of a prior
      // REVISION_CONFLICT this exact retry loop already resolved once for the
      // *previous* stale revision, but on the *same* operationUuid it had
      // already been minted with when reconcileRevision only regenerated the
      // UUID for that mismatch and not for every subsequent one).
      const needsFreshOperation = new Set(['REVISION_CONFLICT', 'VERIFICATION_IDENTITY_CONFLICT']);
      const reconcileRevision = async (kind: 'objective' | 'written'): Promise<void> => {
        const readback = await objectiveClient.getResult(current.resultUuid);
        updateV3DynamicObjectiveOutbox(current.resultUuid, kind === 'objective' ? {
          expectedRevision: readback.revision,
          verificationSyncUuid: createV2Uuid(),
          verificationOperationUuid: createV2Uuid(),
        } : {
          expectedRevision: readback.revision,
          writtenVerificationSyncUuid: createV2Uuid(),
          writtenVerificationOperationUuid: createV2Uuid(),
        });
        reload();
      };

      let latestRevision: number;
      for (let attempt = 1; ; attempt += 1) {
        if (current.expectedRevision == null) {
          throw new Error('The detection acknowledgement did not provide a result revision.');
        }
        const objectiveRequest: V3VerificationBatchRequest = {
          contractVersion: '3.0',
          syncUuid: current.verificationSyncUuid,
          operationUuid: current.verificationOperationUuid,
          assignmentUuid: current.assignmentUuid,
          items: [{
            resultUuid: current.resultUuid,
            expectedRevision: current.expectedRevision,
            pageDecisions: current.pages.map(page => ({
              verificationUuid: page.pageVerificationUuid,
              scanPageUuid: page.scanPageUuid,
              action: 'accepted',
              reasonCode: null,
              comment: null,
              clientDecidedAt: decidedAt,
            })),
            // The backend now accepts an 'uncertain'/'multiple_marks' detection
            // through objective verification directly (it records the ambiguous
            // status faithfully - no option gets picked on the student's behalf -
            // and scores it as zero, same as blank). Every detection is sent; none
            // are held back pending a rescan.
            answers: current.objectiveDetections
              .map(detection => ({
                answerUuid: detection.answerUuid,
                verificationUuid: detection.verificationUuid,
                questionUuid: detection.questionUuid,
                regionUuid: detection.regionUuid,
                scanPageUuid: detection.scanPageUuid,
                evaluation: {kind: 'objective' as const, detectionUuid: detection.detectionUuid},
                comment: null,
                clientDecidedAt: decidedAt,
              })),
          }],
        };
        // VERIFICATION_IDENTITY_CONFLICT (operationUuid already registered
        // under different content) is a WHOLE-REQUEST rejection, thrown as an
        // HTTP-level error before any per-item outcome exists - it never
        // reaches objectiveResponse.items below, unlike PAGE_DECISION_LOCKED/
        // ANSWER_ALREADY_VERIFIED/REVISION_CONFLICT, which the backend embeds
        // as a per-item outcome inside an otherwise-200 response. Must be
        // caught here, not inspected on the response object.
        let objectiveResponse;
        try {
          objectiveResponse = await objectiveClient.verify(objectiveRequest);
        } catch (verifyError) {
          if (
            verifyError instanceof V3ObjectiveHttpError
            && needsFreshOperation.has(verifyError.code ?? '')
            && attempt < MAX_RECONCILE_ATTEMPTS
          ) {
            await reconcileRevision('objective');
            continue;
          }
          throw verifyError;
        }
        const objectiveOutcome = objectiveResponse.items.find(item => item.resultUuid === current.resultUuid);
        const error = objectiveOutcome?.error;
        if (error && alreadyAcceptedCodes.has(error.code)) {
          const readback = await objectiveClient.getResult(current.resultUuid);
          latestRevision = readback.revision;
          break;
        }
        if (objectiveOutcome?.status === 'success' && objectiveOutcome.revision != null) {
          latestRevision = objectiveOutcome.revision;
          break;
        }
        if (error && needsFreshOperation.has(error.code) && attempt < MAX_RECONCILE_ATTEMPTS) {
          await reconcileRevision('objective');
          continue;
        }
        throw new Error(error
          ? `${error.code}: ${error.message}`
          : 'Backend did not accept the objective verification.');
      }

      if (current.writtenAnswers.length > 0) {
        // Fresh every time: the backend checks this hash/version against its own
        // currently locked reference, so a cached value would be rejected. The
        // phone's cached copy (evaluationReferenceStore) is for display only.
        let reference = await verificationClient.getEvaluationReference(current.assignmentUuid);

        for (const answer of current.writtenAnswers) {
          if (answer.attachmentUploaded) continue;
          const size = await fileSizeBytes(answer.evidenceImageUri);
          await evidenceClient.uploadAttachment({
            contractVersion: '3.0',
            syncUuid: answer.attachmentSyncUuid,
            operationUuid: answer.attachmentOperationUuid,
            attachmentUuid: answer.attachmentUuid,
            resultUuid: current.resultUuid,
            scanPageUuid: answer.scanPageUuid,
            attachmentType: 'teacher_evidence',
            regionUuid: answer.regionUuid,
            sourceAttachmentUuid: null,
            crop: null,
            contentHash: answer.evidenceSha256,
            fileSizeBytes: size,
            // DynamicOmrDetector.kt writes evidence crops as .png, not .jpg.
            mimeType: 'image/png',
            capturedAt: decidedAt,
          }, answer.evidenceImageUri);
          updateV3DynamicWrittenAnswer(current.resultUuid, answer.answerUuid, {attachmentUploaded: true});
        }

        for (let attempt = 1; ; attempt += 1) {
          const maximumPointsByQuestion = new Map(
            reference.questions.map(question => [question.questionUuid, question.maximumPoints]),
          );
          const rubricIdByQuestion = new Map(
            reference.questions.map(question => [question.questionUuid, question.rubricId]),
          );
          const writtenRequest = {
            contractVersion: '3.1' as const,
            syncUuid: current.writtenVerificationSyncUuid,
            operationUuid: current.writtenVerificationOperationUuid,
            assignmentUuid: current.assignmentUuid,
            items: [{
              resultUuid: current.resultUuid,
              expectedRevision: latestRevision,
              testVersionNumber: reference.testVersionNumber,
              evaluationReferenceHash: reference.evaluationReferenceHash,
              // Deliberately empty, not current.pages re-submitted: by the time
              // the written batch is built, the objective verify() call above
              // has already accepted every page, and V3WrittenVerificationService
              // processes pageDecisions and answers in the SAME transaction -
              // an already-accepted page throws PAGE_DECISION_LOCKED from the
              // pageDecisions loop before the answers loop ever runs, rolling
              // back the whole transaction. Treating that as "success anyway"
              // (like the objective side safely can, since those answers were
              // already persisted by an earlier call before the page locked)
              // would be a real data-loss bug here: nothing has ever been
              // persisted for a first-time written submission, so the client
              // would believe it's done while the server has nothing at all.
              pageDecisions: [],
              answers: current.writtenAnswers.map(answer => {
                if (!maximumPointsByQuestion.has(answer.questionUuid)) {
                  throw new Error(
                    `No evaluation-reference entry for question ${answer.questionUuid}.`,
                  );
                }
                const maximumPoints = maximumPointsByQuestion.get(answer.questionUuid)!;
                // The fresh reference is authoritative, not whatever the
                // review screen decided earlier - if the rubric assignment
                // changed server-side between capture and sync (rare, but the
                // backend's own RUBRIC_REQUIRED/RUBRIC_MISMATCH checks exist
                // exactly for this), fail clearly here instead of sending a
                // shape the backend will reject anyway with a less specific
                // error further downstream.
                const currentRubricId = rubricIdByQuestion.get(answer.questionUuid) ?? null;
                let evaluation: V3WrittenAnswer['evaluation'];
                if (answer.score.mode === 'rubric') {
                  if (currentRubricId == null) {
                    throw new Error(
                      `Question ${answer.questionUuid} no longer has a rubric assigned, but this `
                      + 'result was scored with one. Rescore it before sending.',
                    );
                  }
                  if (currentRubricId !== answer.score.rubricId) {
                    throw new Error(
                      `Question ${answer.questionUuid}'s rubric changed since this was scored `
                      + '(reference now points at a different rubric). Rescore it before sending.',
                    );
                  }
                  evaluation = {
                    kind: 'rubric',
                    answerStatus: 'answered',
                    responseText: null,
                    attachmentUuids: [answer.attachmentUuid],
                    rubricId: answer.score.rubricId,
                    criterionScores: answer.score.criterionScores,
                  };
                } else {
                  if (currentRubricId != null) {
                    throw new Error(
                      `Question ${answer.questionUuid} now requires rubric scoring, but this `
                      + 'result was scored Right/Wrong. Rescore it before sending.',
                    );
                  }
                  const points = answer.score.mode === 'points'
                    ? answer.score.points
                    : answer.score.decision === 'correct' ? maximumPoints : 0;
                  if (points > maximumPoints) {
                    throw new Error(
                      `Question ${answer.questionUuid} is now worth ${maximumPoints} points, less than `
                      + `the ${points} given. Rescore it before sending.`,
                    );
                  }
                  evaluation = {
                    kind: 'manual',
                    answerStatus: 'answered',
                    responseText: null,
                    attachmentUuids: [answer.attachmentUuid],
                    points,
                  };
                }
                return {
                  answerUuid: answer.answerUuid,
                  verificationUuid: answer.verificationUuid,
                  questionUuid: answer.questionUuid,
                  regionUuid: answer.regionUuid,
                  scanPageUuid: answer.scanPageUuid,
                  evaluation,
                  comment: null,
                  clientDecidedAt: decidedAt,
                };
              }),
            }],
          };
          // Same HTTP-level-vs-per-item distinction as the objective call above:
          // VERIFICATION_IDENTITY_CONFLICT is a whole-request rejection thrown
          // before any per-item outcome exists.
          let writtenResponse;
          try {
            writtenResponse = await verificationClient.submitWrittenVerificationBatch(writtenRequest);
          } catch (verifyError) {
            if (
              verifyError instanceof V3DynamicVerificationHttpError
              && verifyError.code === 'EVALUATION_REFERENCE_STALE'
              && attempt < MAX_RECONCILE_ATTEMPTS
            ) {
              // The reference changed after it was fetched above (e.g. the
              // one-time hash change when contract 3.1 deployed). Re-fetch and
              // rebuild; a real rubric change still fails with "Rescore".
              reference = await verificationClient.getEvaluationReference(current.assignmentUuid);
              continue;
            }
            if (
              verifyError instanceof V3DynamicVerificationHttpError
              && needsFreshOperation.has(verifyError.code ?? '')
              && attempt < MAX_RECONCILE_ATTEMPTS
            ) {
              await reconcileRevision('written');
              latestRevision = current.expectedRevision!;
              continue;
            }
            throw verifyError;
          }
          const writtenOutcome = writtenResponse.items.find(item => item.resultUuid === current.resultUuid);
          const error = writtenOutcome?.error;
          if (error?.code === 'EVALUATION_REFERENCE_STALE' && attempt < MAX_RECONCILE_ATTEMPTS) {
            reference = await verificationClient.getEvaluationReference(current.assignmentUuid);
            continue;
          }
          // Same reconciliation as the objective outcome above: PAGE_DECISION_LOCKED/
          // ANSWER_ALREADY_VERIFIED here mean this written batch's pages/answers were
          // already accepted in a prior attempt (e.g. one that got this far before an
          // unrelated later step failed) - terminal success, not a real failure.
          if (error && alreadyAcceptedCodes.has(error.code)) {
            const readback = await objectiveClient.getResult(current.resultUuid);
            latestRevision = readback.revision;
            break;
          }
          if (writtenOutcome?.status === 'success' && writtenOutcome.revision != null) {
            latestRevision = writtenOutcome.revision;
            break;
          }
          if (error && needsFreshOperation.has(error.code) && attempt < MAX_RECONCILE_ATTEMPTS) {
            await reconcileRevision('written');
            latestRevision = current.expectedRevision!;
            continue;
          }
          throw new Error(error
            ? `${error.code}: ${error.message}`
            : 'Backend did not accept the written verification.');
        }
      }

      const readback = await objectiveClient.getResult(current.resultUuid);
      updateV3DynamicObjectiveOutbox(current.resultUuid, {
        stage: 'verified',
        expectedRevision: latestRevision,
        centralTestResultId: readback.testResultId,
      });
      reload();
    }

    if (current.stage === 'verified') {
      const readback = await objectiveClient.getResult(current.resultUuid);
      const testResultId = current.centralTestResultId ?? readback.testResultId;
      await objectiveClient.finalize(testResultId);
      const finalized = await objectiveClient.getResult(current.resultUuid);
      if (finalized.resultStatus !== 'finalized' || !finalized.officialScore) {
        throw new Error(
          `Backend finalization returned ${finalized.resultStatus} without an official score.`,
        );
      }
      const analytics = await objectiveClient.getAnalytics(current.resultUuid);
      updateV3DynamicObjectiveOutbox(current.resultUuid, {
        stage: 'finalized',
        centralTestResultId: finalized.testResultId,
        expectedRevision: finalized.revision,
        officialScore: finalized.officialScore,
        analytics,
      });
      reload();
    }

    if (!current.officialScore) {
      throw new Error('The finalized operation has no authoritative backend score.');
    }
    return {record: current, officialScore: current.officialScore};
  } catch (error) {
    const message = friendlyErrorMessage(error) ?? (error instanceof Error ? error.message : 'V3 dynamic objective sync failed.');
    console.error('[V3 Dynamic Sync] FAILED', {
      stage: current.stage,
      name: error instanceof Error ? error.name : typeof error,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    updateV3DynamicObjectiveOutbox(current.resultUuid, {
      stage: current.stage,
      lastError: message,
      incrementRetry: true,
    });
    throw error;
  }
};
