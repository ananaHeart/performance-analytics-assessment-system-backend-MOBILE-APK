import {
  V3ObjectiveHttpError,
  createV3ObjectiveClient,
} from '../src/services/v3/objectiveClient';

const responseWith = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
} as unknown as Response);

const envelope = (data: unknown) => ({
  success: true,
  message: 'Success',
  data,
  errors: null,
});

describe('V3 objective HTTP client', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  test('sends detection UUIDs to the exact protected route with Bearer auth', async () => {
    fetchMock.mockResolvedValue(responseWith(201, envelope({revision: 7, disposition: 'accepted'})));
    const request = {
      contractVersion: '3.0' as const,
      syncUuid: 'sync-uuid',
      operationUuid: 'operation-uuid',
      detections: [{
        detectionUuid: 'detection-uuid',
        regionUuid: 'region-uuid',
        questionUuid: 'question-uuid',
        detectionStatus: 'detected' as const,
        detectedOption: 'A',
        confidence: 0.99,
      }],
    };

    await expect(createV3ObjectiveClient('http://127.0.0.1:8080/', ' token ')
      .uploadDetections('scan-page-uuid', request))
      .resolves.toEqual({revision: 7, disposition: 'accepted'});

    // objectContaining: v3Fetch adds an abort signal for its per-attempt timeout.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/v3/mobile/scan-pages/scan-page-uuid/detections',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(request),
      }),
    );
  });

  test('uses the numeric scoring finalize route and authoritative result readback', async () => {
    fetchMock
      .mockResolvedValueOnce(responseWith(200, envelope({resultStatus: 'finalized'})))
      .mockResolvedValueOnce(responseWith(200, envelope({
        resultUuid: 'result-uuid',
        testResultId: 9001,
        resultStatus: 'finalized',
        revision: 9,
        scoreVersion: 1,
        pendingReasons: [],
        officialScore: {totalScore: 8, maxScore: 10, percentage: 80},
      })));
    const client = createV3ObjectiveClient('http://127.0.0.1:8080', 'token');

    await client.finalize(9001);
    const result = await client.getResult('result-uuid');

    expect(result.officialScore?.percentage).toBe(80);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8080/api/v3/scoring/results/9001/finalize',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://127.0.0.1:8080/api/v3/mobile/results/result-uuid',
    );
  });

  test('preserves a structured 401 so the app can expire the secure session', async () => {
    fetchMock.mockResolvedValue(responseWith(401, {
      success: false,
      message: 'Session expired.',
      data: null,
      errors: {code: 'AUTHENTICATION_REQUIRED'},
    }));

    const request = createV3ObjectiveClient('http://127.0.0.1:8080', 'token')
      .getResult('result-uuid');

    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Session expired.',
      retryable: false,
    });
    await request.catch(error => expect(error).toBeInstanceOf(V3ObjectiveHttpError));
  });
});
