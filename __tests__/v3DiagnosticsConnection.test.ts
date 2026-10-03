import {
  V3AccountNotAllowedError,
  type V3AuthClient,
  type V3AuthSession,
} from '../src/services/v3/authClient';
import { defaultV3DiagnosticsConnection } from '../src/services/v3/diagnosticsConnection';
import type { V3SecureSessionService } from '../src/services/v3/secureSessionService';

jest.mock('../src/config/api', () => ({ V3_API_BASE_URL: 'http://127.0.0.1:8080' }));
jest.mock('../src/database/v3/diagnosticRepository', () => ({}));
jest.mock('../src/services/v3/mobileReadClient', () => ({}));
jest.mock('../src/services/v3/offlineDataService', () => ({}));
jest.mock('../src/services/v3/authClient', () => {
  const client = { login: jest.fn(), verifyMfa: jest.fn(), getMe: jest.fn(), logout: jest.fn() };
  return {
    ...jest.requireActual('../src/services/v3/authClient'),
    createV3AuthClient: () => client,
    mockAuthClient: client,
  };
});
jest.mock('../src/services/v3/secureSessionService', () => {
  const secureSession = {
    save: jest.fn(), restore: jest.fn(), requireActive: jest.fn(),
    rethrowProtectedError: jest.fn(), clear: jest.fn(),
  };
  return {
    createV3SecureSessionService: () => secureSession,
    mockSecureSession: secureSession,
  };
});

const client: jest.Mocked<V3AuthClient> =
  jest.requireMock('../src/services/v3/authClient').mockAuthClient;
const secureSession: jest.Mocked<V3SecureSessionService> =
  jest.requireMock('../src/services/v3/secureSessionService').mockSecureSession;

const BASE_URL = 'http://127.0.0.1:8080';
const sessionFor = (role: string, status = 'active'): V3AuthSession => ({
  tokenType: 'Bearer', accessToken: `${role}-token`, expiresAt: '2026-10-04T00:00:00Z',
  user: {
    userId: 7, schoolId: 'SCHOOL-001', firstName: 'Test', middleName: null,
    lastName: 'User', suffix: null, email: `${role}@example.com`, role, status,
    mfaRequired: role === 'principal',
  },
});

describe('V3 sign-in for accounts that may not use the mobile app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client.logout.mockResolvedValue(undefined);
    secureSession.save.mockResolvedValue(undefined);
  });

  test('logs a principal out on the server and saves nothing on the phone', async () => {
    client.login.mockResolvedValue({ kind: 'authenticated', session: sessionFor('principal') });
    await expect(defaultV3DiagnosticsConnection.login({
      baseUrl: BASE_URL, email: 'principal@example.com', password: 'pw',
    })).rejects.toBeInstanceOf(V3AccountNotAllowedError);
    expect(client.logout).toHaveBeenCalledWith('principal-token');
    expect(secureSession.save).not.toHaveBeenCalled();
  });

  test('applies the same check, logout and no-save after MFA', async () => {
    client.verifyMfa.mockResolvedValue(sessionFor('principal'));
    await expect(defaultV3DiagnosticsConnection.verifyMfa({
      baseUrl: BASE_URL, challengeUuid: '00000000-0000-5000-8000-000000000099',
      code: '123456', verificationMethod: 'authenticator',
    })).rejects.toMatchObject({ reason: 'not_teacher' });
    expect(client.logout).toHaveBeenCalledWith('principal-token');
    expect(secureSession.save).not.toHaveBeenCalled();
  });

  test('logs out an inactive teacher too', async () => {
    client.login.mockResolvedValue({ kind: 'authenticated', session: sessionFor('teacher', 'pending') });
    await expect(defaultV3DiagnosticsConnection.login({
      baseUrl: BASE_URL, email: 'teacher@example.com', password: 'pw',
    })).rejects.toMatchObject({ reason: 'inactive' });
    expect(client.logout).toHaveBeenCalledWith('teacher-token');
    expect(secureSession.save).not.toHaveBeenCalled();
  });

  test('still shows the account message when the logout call itself fails', async () => {
    client.login.mockResolvedValue({ kind: 'authenticated', session: sessionFor('principal') });
    client.logout.mockRejectedValue(new Error('Unable to reach the V3 backend.'));
    await expect(defaultV3DiagnosticsConnection.login({
      baseUrl: BASE_URL, email: 'principal@example.com', password: 'pw',
    })).rejects.toBeInstanceOf(V3AccountNotAllowedError);
    expect(secureSession.save).not.toHaveBeenCalled();
  });

  test('saves an active teacher session without logging out', async () => {
    const session = sessionFor('teacher');
    client.login.mockResolvedValue({ kind: 'authenticated', session });
    await expect(defaultV3DiagnosticsConnection.login({
      baseUrl: BASE_URL, email: 'teacher@example.com', password: 'pw',
    })).resolves.toEqual({ kind: 'authenticated', session });
    expect(secureSession.save).toHaveBeenCalledWith(BASE_URL, session);
    expect(client.logout).not.toHaveBeenCalled();
  });

  test('passes an MFA challenge through untouched', async () => {
    const challenge = {
      challengeUuid: '00000000-0000-5000-8000-000000000099', expiresAt: '2026-10-04T00:00:00Z',
      maximumAttempts: 5, verificationMethods: ['authenticator' as const], emailMasked: 'p***@example.com',
    };
    client.login.mockResolvedValue({ kind: 'mfa_required', challenge });
    await expect(defaultV3DiagnosticsConnection.login({
      baseUrl: BASE_URL, email: 'principal@example.com', password: 'pw',
    })).resolves.toEqual({ kind: 'mfa_required', challenge });
    expect(client.logout).not.toHaveBeenCalled();
    expect(secureSession.save).not.toHaveBeenCalled();
  });
});
