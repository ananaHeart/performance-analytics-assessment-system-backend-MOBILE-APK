/**
 * BUG-1 ("outside the allowed time"): the phone's side of the capture time.
 * The backend compares capturedAt with the assignment's openAt/closeAt, so
 * the phone must send an unambiguous UTC instant and must send the SAME value
 * on every retry (it is part of the upload's identity).
 */
import type { V3DynamicObjectiveOutboxRecord } from '../src/database/v3/dynamicObjectiveRepository';
import { syncV3DynamicObjectiveResult } from '../src/services/v3/dynamicObjectiveSyncService';
import { v3NowIso } from '../src/database/v3/database';

jest.mock('react-native-quick-sqlite', () => ({ open: jest.fn() }));

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

const CAPTURED_AT = '2026-10-23T02:15:00.000Z'; // 10:15 AM in the Philippines

const queuedRecord = (): V3DynamicObjectiveOutboxRecord => ({
  resultUuid: 'result-uuid',
  testAssignmentId: 1,
  testId: 1,
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
    capturedAt: CAPTURED_AT,
    detectionSyncUuid: 'detection-sync-uuid',
    detectionOperationUuid: 'detection-operation-uuid',
    pageVerificationUuid: 'page-verification-uuid',
    writtenPageVerificationUuid: 'written-page-verification-uuid',
    uploaded: false,
    detectionsUploaded: false,
  }],
  objectiveDetections: [],
  writtenAnswers: [],
  stage: 'queued',
  expectedRevision: null,
  centralTestResultId: null,
  officialScore: null,
  retryCount: 0,
  lastError: null,
} as unknown as V3DynamicObjectiveOutboxRecord);

describe('BUG-1: capture time sent by the phone', () => {
  afterEach(() => jest.useRealTimers());

  test('the saved capture time is a UTC instant, not Philippine wall-clock time', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-23T10:15:00+08:00'));
    expect(v3NowIso()).toBe(CAPTURED_AT);
  });

  test('every upload attempt sends the same saved capturedAt, ending in Z', async () => {
    mockStored = queuedRecord();
    const rejection = Object.assign(new Error('The capture falls outside the assignment\'s permitted capture policy.'), {
      code: 'CAPTURE_NOT_ALLOWED',
    });
    mockObjectiveClient.uploadScanPage.mockRejectedValue(rejection);

    await expect(syncV3DynamicObjectiveResult('http://127.0.0.1:8080', 'token', mockStored)).rejects.toBe(rejection);
    await expect(syncV3DynamicObjectiveResult('http://127.0.0.1:8080', 'token', mockStored)).rejects.toBe(rejection);

    const sent = mockObjectiveClient.uploadScanPage.mock.calls.map(([metadata]) => metadata.capturedAt);
    expect(sent).toEqual([CAPTURED_AT, CAPTURED_AT]);
    expect(sent.every(value => value.endsWith('Z'))).toBe(true);
    // A rejected upload stays queued on the phone; nothing is lost.
    expect(mockStored.stage).toBe('queued');
    expect(mockStored.lastError).toMatch(/CAPTURE_NOT_ALLOWED|scheduling rule|outside/i);
  });
});
