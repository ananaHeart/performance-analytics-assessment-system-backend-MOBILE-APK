/**
 * V3 mobile written-evidence attachment upload client.
 *
 * Matches the backend contract read directly from source (not guessed):
 * - com.capstone.assessment.v3.mobile.controller.V3AttachmentUploadController
 * - com.capstone.assessment.v3.mobile.service.V3AttachmentUploadService
 * - com.capstone.assessment.v3.mobile.dto.V3AttachmentMetadata / V3AttachmentResponse
 *
 * `POST /api/v3/mobile/attachments` is release-gated (denied under the plain `v3`
 * profile; only open once `v3-mobile-release` preflight passes), same as the rest of
 * the objective upload chain in objectiveClient.ts.
 *
 * An `answer_crop` or `normalized_page` attachment's `crop.baseAttachmentUuid` (or
 * `sourceAttachmentUuid`, for normalized_page) must reference either the scan page's
 * server-generated `original_page` attachment row, or a `normalized_page` derived from
 * it (see V3AttachmentUploadService.lineage()). That UUID is generated server-side
 * with `UUID.randomUUID()` (V3OriginalScanImageStorage.java) and is never derivable
 * client-side — it comes back as `originalAttachmentUuid` in the scan-page upload
 * response (see objectiveClient.ts's `uploadScanPage`). Read it from there and pass it
 * straight through as `crop.baseAttachmentUuid` for a direct-from-original crop.
 */

import { v3Fetch } from './coldStartFetch';

export type V3AttachmentType = 'normalized_page' | 'answer_crop' | 'teacher_evidence';

export interface V3AttachmentCrop {
  baseAttachmentUuid: string;
  coordinateSpace: 'image_pixels_top_left';
  baseWidthPx: number;
  baseHeightPx: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface V3AttachmentUploadRequest {
  contractVersion: '3.0';
  syncUuid: string;
  operationUuid: string;
  attachmentUuid: string;
  resultUuid: string;
  scanPageUuid: string;
  attachmentType: V3AttachmentType;
  regionUuid: string | null;
  sourceAttachmentUuid: string | null;
  crop: V3AttachmentCrop | null;
  contentHash: string;
  fileSizeBytes: number;
  mimeType: 'image/jpeg' | 'image/png';
  capturedAt: string;
}

export interface V3AttachmentUploadResponse {
  attachmentUuid: string;
  backendAttachmentId: number;
  contentHash: string;
  uploadStatus: 'created' | 'replayed';
  acknowledgedAt: string;
}

export class V3AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V3AttachmentValidationError';
  }
}

export class V3AttachmentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'V3AttachmentHttpError';
  }
}

// Same "any RFC 4122 UUID" pattern already used by src/prototypes/v3WrittenResponseReview/model.ts.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
// Stated contract limit (V3_MOBILE_INTEGRATION_HANDOFF.md: "Max image/file contract is 15 MiB").
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_COORDINATE = 40_000_000;

const fail = (message: string): never => {
  throw new V3AttachmentValidationError(message);
};

const requireUuid = (value: string | null, field: string): void => {
  if (value !== null && !UUID_PATTERN.test(value)) {
    fail(`${field} must be a canonical lowercase UUID.`);
  }
};

/**
 * Mirrors V3AttachmentUploadService.validate() exactly, so a malformed request fails
 * fast on-device instead of round-tripping to the backend for the same rejection.
 */
export const validateV3AttachmentUploadRequest = (
  request: V3AttachmentUploadRequest,
): void => {
  if (request.contractVersion !== '3.0') fail('contractVersion must be "3.0".');
  requireUuid(request.syncUuid, 'syncUuid');
  requireUuid(request.operationUuid, 'operationUuid');
  requireUuid(request.attachmentUuid, 'attachmentUuid');
  requireUuid(request.resultUuid, 'resultUuid');
  requireUuid(request.scanPageUuid, 'scanPageUuid');
  if (request.regionUuid !== null) requireUuid(request.regionUuid, 'regionUuid');
  if (request.sourceAttachmentUuid !== null) {
    requireUuid(request.sourceAttachmentUuid, 'sourceAttachmentUuid');
  }
  if (!SHA256_PATTERN.test(request.contentHash)) {
    fail('contentHash must be a lowercase SHA-256 hash.');
  }
  if (!Number.isSafeInteger(request.fileSizeBytes) || request.fileSizeBytes < 1
      || request.fileSizeBytes > MAX_FILE_BYTES) {
    fail(`fileSizeBytes must be between 1 and ${MAX_FILE_BYTES}.`);
  }
  if (request.mimeType !== 'image/jpeg' && request.mimeType !== 'image/png') {
    fail('mimeType must be image/jpeg or image/png.');
  }
  if (!request.capturedAt.endsWith('Z') || Number.isNaN(Date.parse(request.capturedAt))) {
    fail('capturedAt must be a UTC ISO-8601 timestamp.');
  }

  if (request.attachmentType === 'normalized_page') {
    if (request.sourceAttachmentUuid === null || request.regionUuid !== null
        || request.crop !== null || request.attachmentUuid === request.sourceAttachmentUuid) {
      fail('normalized_page requires sourceAttachmentUuid, and forbids regionUuid/crop.');
    }
    return;
  }

  if (request.sourceAttachmentUuid !== null) {
    fail('Only normalized_page may set sourceAttachmentUuid.');
  }

  if (request.attachmentType === 'answer_crop') {
    if (request.regionUuid === null) {
      fail('answer_crop requires regionUuid.');
    }
    const crop = request.crop;
    if (crop === null) {
      throw new V3AttachmentValidationError('answer_crop requires crop.');
    }
    requireUuid(crop.baseAttachmentUuid, 'crop.baseAttachmentUuid');
    if (request.attachmentUuid === crop.baseAttachmentUuid) {
      fail('crop.baseAttachmentUuid must not equal attachmentUuid.');
    }
    if (crop.coordinateSpace !== 'image_pixels_top_left') {
      fail('crop.coordinateSpace must be "image_pixels_top_left".');
    }
    if (crop.baseWidthPx < 1 || crop.baseWidthPx > MAX_COORDINATE
        || crop.baseHeightPx < 1 || crop.baseHeightPx > MAX_COORDINATE) {
      fail('crop base dimensions are out of range.');
    }
    if (crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1
        || crop.width > crop.baseWidthPx || crop.height > crop.baseHeightPx
        || crop.x > crop.baseWidthPx - crop.width || crop.y > crop.baseHeightPx - crop.height) {
      fail('crop rectangle does not fit inside its declared base image.');
    }
    return;
  }

  // teacher_evidence
  if (request.crop !== null) {
    fail('teacher_evidence must not set crop.');
  }
};

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: {code?: string} | null;
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.success || body.data == null) {
    throw new V3AttachmentHttpError(
      response.status,
      body?.errors?.code ?? null,
      body?.message || `V3 attachment upload failed with status ${response.status}.`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  return body.data;
};

export const createV3WrittenEvidenceClient = (baseUrl: string, accessToken: string) => {
  const origin = baseUrl.replace(/\/+$/, '');
  const token = accessToken.trim();
  if (!token) throw new Error('A V3 session is required for attachment upload.');

  return {
    /**
     * Uploads one attachment (normalized_page, answer_crop, or teacher_evidence) as a
     * two-part multipart request: a `metadata` JSON part and a `file` binary part,
     * matching V3AttachmentUploadController's exact-two-parts requirement.
     */
    uploadAttachment: async (
      request: V3AttachmentUploadRequest,
      fileUri: string,
    ): Promise<V3AttachmentUploadResponse> => {
      validateV3AttachmentUploadRequest(request);

      const form = new FormData();
      // See objectiveClient.ts's uploadScanPage: RN's FormData polyfill has no real
      // support for `Blob` parts, and a `Blob` here can fail at the native layer as
      // a generic `TypeError: Network request failed`. `{string, type}` is the shape
      // FormData.js/NetworkingModule actually support for a JSON string part.
      form.append(
        'metadata',
        {string: JSON.stringify(request), type: 'application/json'} as unknown as Blob,
      );
      const extension = request.mimeType === 'image/png' ? 'png' : 'jpg';
      form.append('file', {
        uri: fileUri,
        type: request.mimeType,
        name: `${request.attachmentUuid}.${extension}`,
      } as unknown as Blob);

      return parseResponse<V3AttachmentUploadResponse>(
        await v3Fetch(`${origin}/api/v3/mobile/attachments`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }),
      );
    },
  };
};
