import { v3Fetch } from './coldStartFetch';

export interface V3ScanPageMetadata {
  contractVersion: '3.0';
  syncUuid: string;
  resultUuid: string;
  scanUuid: string;
  scanPageUuid: string;
  answerSheetUuid: string;
  pageUuid: string;
  assignmentUuid: string;
  classListId: number;
  pageNumber: number;
  captureNumber: number;
  scannerVersion: string;
  qrPayloadHash: string;
  imageHash: string;
  capturedAt: string;
}

export interface V3DetectionUploadItem {
  detectionUuid: string;
  regionUuid: string;
  questionUuid: string;
  detectionStatus: 'detected' | 'blank' | 'multiple_marks' | 'uncertain';
  detectedOption: string | null;
  confidence: number;
}

export interface V3DetectionBatchRequest {
  contractVersion: '3.0';
  syncUuid: string;
  operationUuid: string;
  detections: V3DetectionUploadItem[];
}

export interface V3VerificationBatchRequest {
  contractVersion: '3.0';
  syncUuid: string;
  operationUuid: string;
  assignmentUuid: string;
  items: Array<{
    resultUuid: string;
    expectedRevision: number;
    pageDecisions: Array<{
      verificationUuid: string;
      scanPageUuid: string;
      action: 'accepted';
      reasonCode: null;
      comment: null;
      clientDecidedAt: string;
    }>;
    answers: Array<{
      answerUuid: string;
      verificationUuid: string;
      questionUuid: string;
      regionUuid: string;
      scanPageUuid: string;
      evaluation: {kind: 'objective'; detectionUuid: string};
      comment: null;
      clientDecidedAt: string;
    }>;
  }>;
}

export interface V3ObjectiveResultReadback {
  contractVersion: string;
  resultUuid: string;
  testResultId: number;
  resultStatus: string;
  revision: number;
  scoreVersion: number;
  pendingReasons: string[];
  officialScore: null | {
    totalScore: number;
    maxScore: number;
    percentage: number;
    performanceStatus: string;
    performanceLabel: string;
    resultStatus: string;
  };
}

export class V3ObjectiveHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'V3ObjectiveHttpError';
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: {code?: string} | null;
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.success || body.data == null) {
    throw new V3ObjectiveHttpError(
      response.status,
      body?.errors?.code ?? null,
      body?.message || `V3 objective request failed with status ${response.status}.`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  return body.data;
};

const jsonHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  // Without this, Android's underlying HTTP client can serve a cached body for
  // a GET to the same URL (e.g. getResult()) instead of hitting the network -
  // fatal for a readback whose entire purpose is reading the server's true
  // current state (revision, resultStatus) right now, not what it was on an
  // earlier call in the same sync attempt.
  'Cache-Control': 'no-cache',
});

export const createV3ObjectiveClient = (baseUrl: string, accessToken: string) => {
  const origin = baseUrl.replace(/\/+$/, '');
  const token = accessToken.trim();
  if (!token) throw new Error('A V3 session is required for result upload.');

  return {
    uploadScanPage: async (metadata: V3ScanPageMetadata, imageUri: string) => {
      const form = new FormData();
      // React Native's FormData polyfill does not support the web `Blob` type as a
      // part value (Libraries/Network/FormData.js only spreads `{uri, type, name}` or
      // `{string, type}` shapes) - passing a real `Blob` here silently produces a
      // malformed part and, when the Blob TurboModule isn't reachable under the New
      // Architecture, the whole request fails at the native layer with a generic
      // `TypeError: Network request failed`. `{string, type}` sets the part's
      // content-type via the same native header path without touching Blob at all.
      form.append(
        'metadata',
        {string: JSON.stringify(metadata), type: 'application/json'} as unknown as Blob,
      );
      form.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: `${metadata.scanPageUuid}.jpg`,
      } as unknown as Blob);
      return parseResponse<{
        resultUuid: string;
        scanPageUuid: string;
        backendScanPageId: number;
        uploadStatus: string;
        pageStatus: string;
        // The scan page's server-generated `original_page` attachment identity.
        // Required as `crop.baseAttachmentUuid` when uploading an `answer_crop` or
        // `normalized_page` attachment via writtenEvidenceClient.ts — the backend
        // generates this with UUID.randomUUID() and never derives it deterministically,
        // so this response field is the only way to learn it.
        originalAttachmentUuid: string;
      }>(await v3Fetch(`${origin}/api/v3/mobile/scan-pages`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: form,
      }));
    },
    uploadDetections: async (scanPageUuid: string, request: V3DetectionBatchRequest) =>
      parseResponse<{revision: number; disposition: string}>(await v3Fetch(
        `${origin}/api/v3/mobile/scan-pages/${scanPageUuid}/detections`,
        {method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(request)},
      )),
    verify: async (request: V3VerificationBatchRequest) =>
      parseResponse<{
        syncStatus: string;
        items: Array<{
          resultUuid: string;
          status: string;
          disposition: string;
          revision: number | null;
          error: {code: string; message: string; retryable: boolean} | null;
        }>;
      }>(await v3Fetch(`${origin}/api/v3/mobile/verification-batches`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(request),
      })),
    getResult: async (resultUuid: string) =>
      parseResponse<V3ObjectiveResultReadback>(await v3Fetch(
        `${origin}/api/v3/mobile/results/${resultUuid}`,
        {headers: jsonHeaders(token)},
      )),
    finalize: async (testResultId: number) =>
      parseResponse<Record<string, unknown>>(await v3Fetch(
        `${origin}/api/v3/scoring/results/${testResultId}/finalize`,
        {method: 'POST', headers: jsonHeaders(token)},
      )),
    getAnalytics: async (resultUuid: string) =>
      parseResponse<Record<string, unknown>>(await v3Fetch(
        `${origin}/api/v3/mobile/results/${resultUuid}/analytics`,
        {headers: jsonHeaders(token)},
      )),
  };
};
