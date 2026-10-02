import type {V3ObjectiveOutboxRecord} from '../src/database/v3/objectiveRepository';
import {syncV3ObjectiveResult} from '../src/services/v3/objectiveSyncService';

const mockGetV3ObjectiveOutbox = jest.fn();
const mockUpdateV3ObjectiveOutbox = jest.fn();
const mockUploadScanPage = jest.fn();
const mockUploadDetections = jest.fn();
const mockVerify = jest.fn();
const mockGetResult = jest.fn();
const mockFinalize = jest.fn();
const mockGetAnalytics = jest.fn();

jest.mock('../src/database/v3/objectiveRepository', () => ({
  getV3ObjectiveOutbox: (...args: unknown[]) => mockGetV3ObjectiveOutbox(...args),
  updateV3ObjectiveOutbox: (...args: unknown[]) => mockUpdateV3ObjectiveOutbox(...args),
}));

jest.mock('../src/services/v3/objectiveClient', () => ({
  createV3ObjectiveClient: () => ({
    uploadScanPage: mockUploadScanPage,
    uploadDetections: mockUploadDetections,
    verify: mockVerify,
    getResult: mockGetResult,
    finalize: mockFinalize,
    getAnalytics: mockGetAnalytics,
  }),
}));

const score = {
  totalScore: 8,
  maxScore: 10,
  percentage: 80,
  performanceStatus: 'proficient',
  performanceLabel: 'Proficient',
  resultStatus: 'finalized',
};

const makeRecord = (stage: V3ObjectiveOutboxRecord['stage'] = 'queued'):
V3ObjectiveOutboxRecord => ({
  resultUuid: 'result-uuid',
  testAssignmentId: 101,
  testId: 202,
  assignmentUuid: 'assignment-uuid',
  classListId: 303,
  studentId: 404,
  scanUuid: 'scan-uuid',
  scanPageUuid: 'scan-page-uuid',
  scanSyncUuid: 'scan-sync-uuid',
  detectionSyncUuid: 'detection-sync-uuid',
  detectionOperationUuid: 'detection-operation-uuid',
  verificationSyncUuid: 'verification-sync-uuid',
  verificationOperationUuid: 'verification-operation-uuid',
  pageVerificationUuid: 'page-verification-uuid',
  answerSheetUuid: 'answer-sheet-uuid',
  pageUuid: 'page-uuid',
  qrPayloadHash: 'qr-hash',
  imageUri: 'file:///immutable.jpg',
  imageHash: 'image-hash',
  scannerVersion: '3.0.0',
  capturedAt: '2026-09-14T10:00:00.000Z',
  detections: [{
    detectionUuid: 'detection-uuid',
    answerUuid: 'answer-uuid',
    verificationUuid: 'verification-uuid',
    regionUuid: 'region-uuid',
    questionUuid: 'question-uuid',
    itemNumber: 1,
    detectionStatus: 'detected',
    detectedOption: 'B',
    confidence: 0.98,
  }],
  stage,
  expectedRevision: stage === 'queued' || stage === 'scan_uploaded' ? null : 7,
  centralTestResultId: stage === 'verified' || stage === 'finalized' ? 9001 : null,
  officialScore: stage === 'finalized' ? score : null,
  retryCount: 0,
  lastError: null,
});

describe('V3 objective result sync', () => {
  let stored: V3ObjectiveOutboxRecord;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = makeRecord();
    mockGetV3ObjectiveOutbox.mockImplementation(() => stored);
    mockUpdateV3ObjectiveOutbox.mockImplementation((_uuid, update) => {
      stored = {
        ...stored,
        ...update,
        expectedRevision: update.expectedRevision ?? stored.expectedRevision,
        centralTestResultId: update.centralTestResultId ?? stored.centralTestResultId,
        officialScore: update.officialScore ?? stored.officialScore,
      };
    });
    mockUploadScanPage.mockResolvedValue({uploadStatus: 'accepted'});
    mockUploadDetections.mockResolvedValue({revision: 7, disposition: 'accepted'});
    mockVerify.mockResolvedValue({
      syncStatus: 'completed',
      items: [{resultUuid: 'result-uuid', status: 'success', disposition: 'accepted', revision: 8, error: null}],
    });
    mockGetResult
      .mockResolvedValueOnce({testResultId: 9001, resultStatus: 'verified', revision: 8, officialScore: null})
      .mockResolvedValueOnce({testResultId: 9001, resultStatus: 'verified', revision: 8, officialScore: null})
      .mockResolvedValueOnce({testResultId: 9001, resultStatus: 'finalized', revision: 9, officialScore: score});
    mockFinalize.mockResolvedValue({resultStatus: 'finalized'});
    mockGetAnalytics.mockResolvedValue({resultUuid: 'result-uuid', percentage: 80});
  });

  test('persists each acknowledged stage and the authoritative backend score', async () => {
    const result = await syncV3ObjectiveResult('http://127.0.0.1:8080', 'token', stored);

    expect(mockUploadScanPage).toHaveBeenCalledWith(
      expect.objectContaining({
        resultUuid: 'result-uuid',
        scanPageUuid: 'scan-page-uuid',
        scannerVersion: '3.0.0',
        capturedAt: '2026-09-14T10:00:00.000Z',
      }),
      'file:///immutable.jpg',
    );
    expect(mockUploadDetections).toHaveBeenCalledWith(
      'scan-page-uuid',
      expect.objectContaining({
        syncUuid: 'detection-sync-uuid',
        operationUuid: 'detection-operation-uuid',
      }),
    );
    expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({
      syncUuid: 'verification-sync-uuid',
      operationUuid: 'verification-operation-uuid',
      items: [expect.objectContaining({
        resultUuid: 'result-uuid',
        expectedRevision: 7,
        pageDecisions: [expect.objectContaining({clientDecidedAt: stored.capturedAt})],
        answers: [expect.objectContaining({clientDecidedAt: stored.capturedAt})],
      })],
    }));
    expect(mockFinalize).toHaveBeenCalledWith(9001);
    expect(result.officialScore).toEqual(score);
    expect(mockUpdateV3ObjectiveOutbox.mock.calls.map(call => call[1].stage)).toEqual([
      'scan_uploaded',
      'detections_uploaded',
      'verified',
      'finalized',
    ]);
  });

  test('resumes after detection acknowledgement without uploading scan or detections again', async () => {
    stored = makeRecord('detections_uploaded');

    await syncV3ObjectiveResult('http://127.0.0.1:8080', 'token', stored);

    expect(mockUploadScanPage).not.toHaveBeenCalled();
    expect(mockUploadDetections).not.toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockFinalize).toHaveBeenCalledWith(9001);
  });

  test('keeps the current durable stage and records a retry after a network failure', async () => {
    const failure = new Error('network unavailable');
    mockUploadScanPage.mockRejectedValue(failure);

    await expect(
      syncV3ObjectiveResult('http://127.0.0.1:8080', 'token', stored),
    ).rejects.toBe(failure);

    expect(mockUpdateV3ObjectiveOutbox).toHaveBeenLastCalledWith('result-uuid', {
      stage: 'queued',
      lastError: 'network unavailable',
      incrementRetry: true,
    });
  });
});
