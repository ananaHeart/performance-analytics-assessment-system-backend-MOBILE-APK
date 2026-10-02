import {
  V3AttachmentHttpError,
  V3AttachmentValidationError,
  createV3WrittenEvidenceClient,
  validateV3AttachmentUploadRequest,
  type V3AttachmentUploadRequest,
} from '../src/services/v3/writtenEvidenceClient';

const responseWith = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
} as unknown as Response);

const envelope = (data: unknown) => ({
  success: true,
  message: 'Attachment acknowledged.',
  data,
  errors: null,
});

const baseAnswerCrop = (): V3AttachmentUploadRequest => ({
  contractVersion: '3.0',
  syncUuid: '11111111-1111-4111-8111-111111111111',
  operationUuid: '22222222-2222-4222-8222-222222222222',
  attachmentUuid: '33333333-3333-4333-8333-333333333333',
  resultUuid: '44444444-4444-4444-8444-444444444444',
  scanPageUuid: '55555555-5555-4555-8555-555555555555',
  attachmentType: 'answer_crop',
  regionUuid: '66666666-6666-4666-8666-666666666666',
  sourceAttachmentUuid: null,
  crop: {
    baseAttachmentUuid: '77777777-7777-4777-8777-777777777777',
    coordinateSpace: 'image_pixels_top_left',
    baseWidthPx: 2000,
    baseHeightPx: 3000,
    x: 100,
    y: 200,
    width: 400,
    height: 150,
  },
  contentHash: 'a'.repeat(64),
  fileSizeBytes: 12_345,
  mimeType: 'image/jpeg',
  capturedAt: '2026-09-16T10:00:00.000Z',
});

describe('V3 written-evidence attachment client', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('validateV3AttachmentUploadRequest', () => {
    test('accepts a well-formed answer_crop request', () => {
      expect(() => validateV3AttachmentUploadRequest(baseAnswerCrop())).not.toThrow();
    });

    test('rejects answer_crop missing regionUuid', () => {
      const request = {...baseAnswerCrop(), regionUuid: null};
      expect(() => validateV3AttachmentUploadRequest(request)).toThrow(
        V3AttachmentValidationError,
      );
    });

    test('rejects a crop rectangle that does not fit inside its base image', () => {
      const request = baseAnswerCrop();
      request.crop = {...request.crop!, x: 1900, width: 400};
      expect(() => validateV3AttachmentUploadRequest(request)).toThrow(
        /does not fit inside/,
      );
    });

    test('rejects crop.baseAttachmentUuid equal to attachmentUuid', () => {
      const request = baseAnswerCrop();
      request.crop = {...request.crop!, baseAttachmentUuid: request.attachmentUuid};
      expect(() => validateV3AttachmentUploadRequest(request)).toThrow();
    });

    test('accepts normalized_page with sourceAttachmentUuid and no crop/region', () => {
      const request: V3AttachmentUploadRequest = {
        ...baseAnswerCrop(),
        attachmentType: 'normalized_page',
        regionUuid: null,
        crop: null,
        sourceAttachmentUuid: '88888888-8888-4888-8888-888888888888',
      };
      expect(() => validateV3AttachmentUploadRequest(request)).not.toThrow();
    });

    test('rejects teacher_evidence carrying a crop', () => {
      const request: V3AttachmentUploadRequest = {
        ...baseAnswerCrop(),
        attachmentType: 'teacher_evidence',
      };
      expect(() => validateV3AttachmentUploadRequest(request)).toThrow(
        /must not set crop/,
      );
    });

    test('rejects a non-lowercase-hex contentHash', () => {
      const request = {...baseAnswerCrop(), contentHash: 'NOT-A-HASH'};
      expect(() => validateV3AttachmentUploadRequest(request)).toThrow();
    });
  });

  test('uploads a two-part multipart request to the exact protected route with Bearer auth', async () => {
    fetchMock.mockResolvedValue(responseWith(201, envelope({
      attachmentUuid: baseAnswerCrop().attachmentUuid,
      backendAttachmentId: 9001,
      contentHash: 'a'.repeat(64),
      uploadStatus: 'created',
      acknowledgedAt: '2026-09-16T10:00:01.000Z',
    })));

    const client = createV3WrittenEvidenceClient('http://127.0.0.1:8080/', ' token ');
    const request = baseAnswerCrop();
    await expect(client.uploadAttachment(request, 'file:///evidence.jpg')).resolves.toMatchObject({
      uploadStatus: 'created',
      backendAttachmentId: 9001,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8080/api/v3/mobile/attachments');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer token',
    });
    expect(init.body).toBeInstanceOf(FormData);
  });

  test('surfaces a replayed upload without treating it as an error', async () => {
    fetchMock.mockResolvedValue(responseWith(200, envelope({
      attachmentUuid: baseAnswerCrop().attachmentUuid,
      backendAttachmentId: 9001,
      contentHash: 'a'.repeat(64),
      uploadStatus: 'replayed',
      acknowledgedAt: '2026-09-16T10:00:01.000Z',
    })));

    const client = createV3WrittenEvidenceClient('http://127.0.0.1:8080', 'token');
    await expect(client.uploadAttachment(baseAnswerCrop(), 'file:///evidence.jpg'))
      .resolves.toMatchObject({uploadStatus: 'replayed'});
  });

  test('rejects an invalid request before any network call is made', async () => {
    const request = {...baseAnswerCrop(), contentHash: 'not-a-hash'};
    const client = createV3WrittenEvidenceClient('http://127.0.0.1:8080', 'token');

    await expect(client.uploadAttachment(request, 'file:///evidence.jpg')).rejects.toThrow(
      V3AttachmentValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('preserves a structured conflict error for identity reuse under different content', async () => {
    fetchMock.mockResolvedValue(responseWith(409, {
      success: false,
      message: 'Attachment, operation or sync identity is already bound to different content.',
      data: null,
      errors: {code: 'ATTACHMENT_IDENTITY_CONFLICT'},
    }));

    const client = createV3WrittenEvidenceClient('http://127.0.0.1:8080', 'token');
    const request = client.uploadAttachment(baseAnswerCrop(), 'file:///evidence.jpg');

    await expect(request).rejects.toMatchObject({
      status: 409,
      code: 'ATTACHMENT_IDENTITY_CONFLICT',
      retryable: false,
    });
    await request.catch(error => expect(error).toBeInstanceOf(V3AttachmentHttpError));
  });
});
