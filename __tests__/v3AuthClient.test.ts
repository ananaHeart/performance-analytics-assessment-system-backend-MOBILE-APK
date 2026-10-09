import {
  V3AccountNotAllowedError,
  V3AuthHttpError,
  createV3AuthClient,
  requireV3TeacherLoginResult,
  requireV3TeacherSession,
  type V3AuthFetch,
  type V3AuthSession,
} from '../src/services/v3/authClient';

const USER = {
  userId: 920001,
  schoolId: 'SCHOOL-001',
  firstName: 'Maria',
  middleName: null,
  lastName: 'Reyes',
  suffix: null,
  email: 'teacher@example.com',
  role: 'teacher',
  status: 'active',
  mfaRequired: false,
};

const SESSION_DATA = {
  tokenType: 'Bearer',
  accessToken: 'raw-v3-session-token',
  expiresAt: '2026-09-07T16:00:00Z',
  user: USER,
} satisfies V3AuthSession;

const responseWith = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);

const fetchMockWith = (
  ...responses: Response[]
): jest.MockedFunction<V3AuthFetch> =>
  jest
    .fn()
    .mockImplementation(() => Promise.resolve(responses.shift()!)) as jest.MockedFunction<V3AuthFetch>;

const envelope = (data: unknown) => ({
  success: true,
  message: 'Success',
  data,
  errors: null,
  timestamp: '2026-09-07T08:00:00Z',
});

describe('isolated V3 authentication client', () => {
  test('logs in and returns the active Bearer session without exposing it in logs', async () => {
    const fetchImpl = fetchMockWith(responseWith(200, envelope(SESSION_DATA)));
    const client = createV3AuthClient({
      baseUrl: 'http://localhost:8082/',
      deviceIdentifier: 'android-test-device',
      fetchImpl,
    });

    const result = await client.login(' teacher@example.com ', 'StrongPass1!');

    expect(result).toEqual({ kind: 'authenticated', session: SESSION_DATA });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8082/api/v3/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'teacher@example.com',
          password: 'StrongPass1!',
          deviceIdentifier: 'android-test-device',
        }),
      }),
    );
  });

  test('completes an authenticator challenge before returning a session', async () => {
    const challengeUuid = 'a98ece17-b5bf-43ef-9393-18f8c779a571';
    const fetchImpl = fetchMockWith(
      responseWith(
        200,
        envelope({
          mfaRequired: true,
          mfaChallenge: {
            challengeUuid,
            expiresAt: '2026-09-07T08:05:00Z',
            maximumAttempts: 5,
            verificationMethods: ['authenticator', 'recovery_code'],
            emailMasked: 't***@example.com',
          },
        }),
      ),
      responseWith(200, envelope(SESSION_DATA)),
    );
    const client = createV3AuthClient({
      baseUrl: 'http://localhost:8082',
      deviceIdentifier: 'android-test-device',
      fetchImpl,
    });

    await expect(client.login('teacher@example.com', 'password')).resolves.toMatchObject({
      kind: 'mfa_required',
      challenge: { challengeUuid },
    });
    await expect(
      client.verifyMfa(challengeUuid, '123456', 'authenticator'),
    ).resolves.toEqual(SESSION_DATA);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://localhost:8082/api/v3/auth/mfa/login/verify',
      expect.objectContaining({
        body: JSON.stringify({
          challengeUuid,
          code: '123456',
          verificationMethod: 'authenticator',
          deviceIdentifier: 'android-test-device',
        }),
      }),
    );
  });

  test('preserves backend authentication error codes', async () => {
    const fetchImpl = fetchMockWith(
      responseWith(401, {
        success: false,
        message: 'Invalid email or password.',
        data: null,
        errors: { code: 'INVALID_CREDENTIALS' },
      }),
    );
    const client = createV3AuthClient({
      baseUrl: 'http://localhost:8082',
      deviceIdentifier: 'android-test-device',
      fetchImpl,
    });

    const request = client.login('teacher@example.com', 'wrong');

    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
    await request.catch(error => expect(error).toBeInstanceOf(V3AuthHttpError));
  });

  test('rejects a session expiry that is not a UTC timestamp', async () => {
    const fetchImpl = fetchMockWith(
      responseWith(200, envelope({ ...SESSION_DATA, expiresAt: 'tomorrow' })),
    );
    const client = createV3AuthClient({
      baseUrl: 'http://127.0.0.1:18082',
      deviceIdentifier: 'android-test-device',
      fetchImpl,
    });

    await expect(client.login('teacher@example.com', 'password')).rejects.toThrow(
      'expiresAt as a UTC ISO-8601 timestamp',
    );
  });

  const thrownBy = (action: () => unknown): unknown => {
    try {
      action();
    } catch (error) {
      return error;
    }
    throw new Error('Expected the action to throw.');
  };

  test('rejects an authenticated principal before Mobile data is requested', () => {
    const error = thrownBy(() =>
      requireV3TeacherLoginResult({
        kind: 'authenticated',
        session: { ...SESSION_DATA, user: { ...USER, role: 'principal' } },
      }),
    );
    expect(error).toBeInstanceOf(V3AccountNotAllowedError);
    expect(error).toMatchObject({
      reason: 'not_teacher',
      title: 'Teacher accounts only',
      message:
        'This mobile app is for teachers. Please log in to Marka on a computer to use your principal account.',
    });
  });

  test('rejects an inactive teacher with user wording', () => {
    const error = thrownBy(() =>
      requireV3TeacherSession({ ...SESSION_DATA, user: { ...USER, status: 'pending' } }),
    );
    expect(error).toBeInstanceOf(V3AccountNotAllowedError);
    expect(error).toMatchObject({
      reason: 'inactive',
      title: 'Account not active yet',
      message:
        "Your teacher account is not active yet. Please wait for the principal's approval, or contact your principal.",
    });
  });
});
