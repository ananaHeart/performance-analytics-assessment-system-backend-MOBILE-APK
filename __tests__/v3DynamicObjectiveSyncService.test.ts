import type { V3DynamicObjectiveOutboxRecord } from '../src/database/v3/dynamicObjectiveRepository';
import { syncV3DynamicObjectiveResult } from '../src/services/v3/dynamicObjectiveSyncService';

let mockStored: V3DynamicObjectiveOutboxRecord;

jest.mock('../src/database/v3/dynamicObjectiveRepository', () => ({
  getV3DynamicObjectiveOutbox: jest.fn(() => mockStored),
  updateV3DynamicObjectiveOutbox: jest.fn((_resultUuid: string, patch: Record<string, unknown>) => {
    const { incrementRetry: _ignored, ...fields } = patch;
    mockStored = { ...mockStored, ...fields } as V3DynamicObjectiveOutboxRecord;
  }),
  updateV3DynamicPage: jest.fn(),
  updateV3DynamicWrittenAnswer: jest.fn(),
}));

const mockObjectiveClient = {
  uploadScanPage: jest.fn(),
  uploadDetections: jest.fn(),
  verify: jest.fn(),
  getResult: jest.fn(),
  finalize: jest.fn(),
  getAnalytics: jest.fn(),
};
jest.mock('../src/services/v3/objectiveClient', () => ({
  createV3ObjectiveClient: () => mockObjectiveClient,
  V3ObjectiveHttpError: class extends Error {},
}));
jest.mock('../src/services/v3/writtenEvidenceClient', () => ({
  createV3WrittenEvidenceClient: () => ({ uploadAttachment: jest.fn() }),
}));
jest.mock('../src/services/v3/dynamicVerificationClient', () => ({
  createV3DynamicVerificationClient: () => ({}),
  V3DynamicVerificationHttpError: class extends Error {},
}));
jest.mock('../src/native/omrScanner', () => ({ getLocalFileSize: jest.fn() }));

const officialScore = { totalScore: 15, maxScore: 20, percentage: 75 };

// A result for an assessment with only written items: its pages were uploaded,
// but there were no MC/TF detections, so no detection acknowledgement ever
// supplied a revision.
const writtenOnlyRecord = (): V3DynamicObjectiveOutboxRecord => ({
  resultUuid: 'result-uuid',
  testAssignmentId: 1036,
  testId: 4,
  assignmentUuid: 'assignment-uuid',
  classListId: 1,
  studentId: 1,
  scanUuid: 'scan-uuid',
  scanSyncUuid: 'scan-sync-uuid',
  verificationSyncUuid: 'verification-sync-uuid',
  verificationOperationUuid: 'verification-operation-uuid',
  writtenVerificationSyncUuid: 'written-sync-uuid',
  writtenVerificationOperationUuid: 'written-operation-uuid',
  answerSheetUuid: 'answer-sheet-uuid',
  pages: [{
    pageNumber: 1,
    totalPages: 1,
    scanPageUuid: 'scan-page-uuid',
    scanSyncUuid: 'page-sync-uuid',
    pageUuid: 'page-uuid',
    qrPayloadHash: 'qr-hash',
    imageUri: 'file:///page.jpg',
    imageHash: 'image-hash',
    scannerVersion: 'test',
    capturedAt: '2026-10-14T07:00:00.000Z',
    detectionSyncUuid: 'detection-sync-uuid',
    detectionOperationUuid: 'detection-operation-uuid',
    pageVerificationUuid: 'page-verification-uuid',
    writtenPageVerificationUuid: 'written-page-verification-uuid',
    uploaded: true,
    detectionsUploaded: true,
  }],
  objectiveDetections: [],
  writtenAnswers: [],
  stage: 'detections_uploaded',
  expectedRevision: null,
  centralTestResultId: null,
  officialScore: null,
  retryCount: 1,
  lastError: 'The detection acknowledgement did not provide a result revision.',
} as unknown as V3DynamicObjectiveOutboxRecord);

describe('dynamic sync for an assessment with no MC/TF items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStored = writtenOnlyRecord();
    mockObjectiveClient.getResult
      .mockResolvedValueOnce({ revision: 3, testResultId: 77, resultStatus: 'pending_verification' })
      .mockResolvedValue({
        revision: 5, testResultId: 77, resultStatus: 'finalized', officialScore,
      });
    mockObjectiveClient.verify.mockResolvedValue({
      items: [{ resultUuid: 'result-uuid', status: 'success', revision: 4 }],
    });
    mockObjectiveClient.finalize.mockResolvedValue({});
    mockObjectiveClient.getAnalytics.mockResolvedValue({});
  });

  test('reads the missing revision from the result and finishes a stuck saved result', async () => {
    const result = await syncV3DynamicObjectiveResult('http://127.0.0.1:8080', 'token', mockStored);

    expect(mockObjectiveClient.verify).toHaveBeenCalledTimes(1);
    const request = mockObjectiveClient.verify.mock.calls[0][0];
    expect(request.items[0].expectedRevision).toBe(3);
    expect(request.items[0].answers).toEqual([]);
    expect(request.items[0].pageDecisions).toEqual([
      expect.objectContaining({ scanPageUuid: 'scan-page-uuid', action: 'accepted' }),
    ]);
    expect(mockObjectiveClient.finalize).toHaveBeenCalledWith(77);
    expect(result.officialScore).toEqual(officialScore);
    expect(mockStored.stage).toBe('finalized');
  });
});
