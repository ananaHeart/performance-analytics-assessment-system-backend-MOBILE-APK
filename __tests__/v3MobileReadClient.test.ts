import {
  V3MobileClientConfigurationError,
  V3MobileContractError,
  V3MobileHttpError,
  V3MobileNetworkError,
  createV3MobileReadClient,
  type V3MobileFetch,
} from '../src/services/v3/mobileReadClient';

const referenceDataFixture =
  require('./fixtures/v3/mobile/reference-data-response.json') as unknown;
const downloadFixture =
  require('./fixtures/v3/mobile/download-response.json') as unknown;
const manifestFixture =
  require('./fixtures/v3/mobile/answer-sheet-manifest-response.json') as unknown;

const ASSIGNMENT_UUID = '26b14ea2-4383-43f5-bb40-f60683ee46bb';
const ANSWER_SHEET_UUID = '56d628da-d7fc-4faa-b018-3f740e048bf0';
const SESSION_TOKEN = 'isolated-v3-session-token';

const responseWith = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);

const rejectedJsonResponse = (status: number): Response =>
  ({
    ok: false,
    status,
    json: jest.fn().mockRejectedValue(new Error('Not JSON')),
  } as unknown as Response);

const fetchMockWith = (
  response: Response,
): jest.MockedFunction<V3MobileFetch> =>
  jest.fn().mockResolvedValue(response) as jest.MockedFunction<V3MobileFetch>;

const createClient = (fetchImpl: V3MobileFetch, token = SESSION_TOKEN) =>
  createV3MobileReadClient({
    baseUrl: 'http://10.0.2.2:8082/',
    getSessionToken: () => token,
    fetchImpl,
  });

describe('isolated V3 Mobile read client', () => {
  test('retrieves and validates reference data with the Bearer token', async () => {
    const fetchImpl = fetchMockWith(responseWith(200, referenceDataFixture));
    const client = createClient(fetchImpl);

    const response = await client.getReferenceData();

    expect(response.data.contractVersion).toBe('3.0');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://10.0.2.2:8082/api/v3/mobile/reference-data',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${SESSION_TOKEN}`,
        },
      }),
    );
  });

  test('retrieves and validates the teacher-owned full snapshot', async () => {
    const fetchImpl = fetchMockWith(responseWith(200, downloadFixture));
    const client = createClient(fetchImpl);

    const response = await client.getDownload();

    expect(response.data.snapshotMode).toBe('full_snapshot');
    expect(response.data.testAssignments[0].assignmentUuid).toBe(
      ASSIGNMENT_UUID,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://10.0.2.2:8082/api/v3/mobile/download',
      expect.any(Object),
    );
  });

  test('retrieves a manifest using canonical assignment and answer-sheet UUIDs', async () => {
    const fetchImpl = fetchMockWith(responseWith(200, manifestFixture));
    const client = createClient(fetchImpl);

    const response = await client.getAnswerSheetManifest(
      ASSIGNMENT_UUID,
      ANSWER_SHEET_UUID,
    );

    expect(response.data.answerSheetUuid).toBe(ANSWER_SHEET_UUID);
    expect(fetchImpl).toHaveBeenCalledWith(
      `http://10.0.2.2:8082/api/v3/mobile/test-assignments/${ASSIGNMENT_UUID}/answer-sheets/${ANSWER_SHEET_UUID}/manifest`,
      expect.any(Object),
    );
  });

  test.each([
    [401, 'AUTHENTICATION_REQUIRED'],
    [403, 'MOBILE_TEACHER_REQUIRED'],
    [404, 'ANSWER_SHEET_MANIFEST_NOT_FOUND'],
    [409, 'ANSWER_SHEET_MANIFEST_INCOMPLETE'],
  ])('preserves structured HTTP %s errors', async (status, code) => {
    const fetchImpl = fetchMockWith(
      responseWith(status, {
        success: false,
        message: `Failure ${status}`,
        data: null,
        errors: { code, detail: 'contract-test' },
        timestamp: '2026-09-01T00:00:00Z',
      }),
    );
    const client = createClient(fetchImpl);

    const request = client.getReferenceData();

    await expect(request).rejects.toMatchObject({
      name: 'V3MobileHttpError',
      status,
      code,
      message: `Failure ${status}`,
      retryable: false,
      errors: { code, detail: 'contract-test' },
    });
    await request.catch(error =>
      expect(error).toBeInstanceOf(V3MobileHttpError),
    );
  });

  test('does not make a request when the session token is missing', async () => {
    const fetchImpl = fetchMockWith(responseWith(200, referenceDataFixture));
    const client = createClient(fetchImpl, '   ');

    await expect(client.getReferenceData()).rejects.toBeInstanceOf(
      V3MobileClientConfigurationError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects malformed manifest UUIDs before making a request', async () => {
    const fetchImpl = fetchMockWith(responseWith(200, manifestFixture));
    const client = createClient(fetchImpl);

    await expect(
      client.getAnswerSheetManifest('NOT-A-UUID', ANSWER_SHEET_UUID),
    ).rejects.toThrow('assignmentUuid must be a canonical lowercase UUID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects success payloads that drift from the approved DTO contract', async () => {
    const referenceEnvelope = referenceDataFixture as Record<string, unknown>;
    const fetchImpl = fetchMockWith(
      responseWith(200, {
        ...referenceEnvelope,
        data: { contractVersion: '2.0' },
      }),
    );
    const client = createClient(fetchImpl);

    await expect(client.getReferenceData()).rejects.toBeInstanceOf(
      V3MobileContractError,
    );
  });

  test('returns a safe fallback for non-JSON HTTP failures', async () => {
    const fetchImpl = fetchMockWith(rejectedJsonResponse(503));
    const client = createClient(fetchImpl);

    await expect(client.getDownload()).rejects.toMatchObject({
      name: 'V3MobileHttpError',
      status: 503,
      code: null,
      retryable: true,
      message: 'V3 Mobile request failed with status 503.',
    });
  });

  test('wraps network failures without exposing the session token', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(
        new Error('connection refused'),
      ) as jest.MockedFunction<V3MobileFetch>;
    const client = createClient(fetchImpl);

    const request = client.getDownload();

    await expect(request).rejects.toBeInstanceOf(V3MobileNetworkError);
    await request.catch(error => {
      expect(error).toMatchObject({
        code: 'NETWORK_UNAVAILABLE',
        message: 'Unable to reach the V3 Mobile service.',
      });
      expect(String(error)).not.toContain(SESSION_TOKEN);
    });
  });
});
