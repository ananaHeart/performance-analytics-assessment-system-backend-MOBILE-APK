import { v3Fetch } from './coldStartFetch';

export const V3_AUTH_LOGIN_PATH = '/api/v3/auth/login' as const;
export const V3_AUTH_ME_PATH = '/api/v3/auth/me' as const;
export const V3_AUTH_LOGOUT_PATH = '/api/v3/auth/logout' as const;
export const V3_AUTH_MFA_LOGIN_VERIFY_PATH =
  '/api/v3/auth/mfa/login/verify' as const;

export type V3AuthFetch = typeof fetch;
export type V3AuthMfaMethod = 'authenticator' | 'recovery_code';

export interface V3AuthUser {
  userId: number;
  schoolId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  email: string;
  role: string;
  status: string;
  mfaRequired: boolean;
}

export interface V3AuthSession {
  tokenType: 'Bearer';
  accessToken: string;
  expiresAt: string;
  user: V3AuthUser;
}

export interface V3AuthMfaChallenge {
  challengeUuid: string;
  expiresAt: string;
  maximumAttempts: number;
  verificationMethods: V3AuthMfaMethod[];
  emailMasked: string;
}

export type V3AuthLoginResult =
  | { kind: 'authenticated'; session: V3AuthSession }
  | { kind: 'mfa_required'; challenge: V3AuthMfaChallenge };

// Shown to the person signing in, so the title and message are user wording.
export class V3AccountNotAllowedError extends Error {
  readonly reason: 'not_teacher' | 'inactive';
  readonly title: string;

  constructor(reason: V3AccountNotAllowedError['reason']) {
    super(
      reason === 'not_teacher'
        ? 'This mobile app is for teachers. Please log in to Marka on a computer to use your principal account.'
        : "Your teacher account is not active yet. Please wait for the principal's approval, or contact your principal.",
    );
    this.name = 'V3AccountNotAllowedError';
    this.reason = reason;
    this.title = reason === 'not_teacher' ? 'Teacher accounts only' : 'Account not active yet';
  }
}

export const requireV3TeacherSession = (
  session: V3AuthSession,
): V3AuthSession => {
  if (session.user.role.toLowerCase() !== 'teacher') {
    throw new V3AccountNotAllowedError('not_teacher');
  }
  if (session.user.status.toLowerCase() !== 'active') {
    throw new V3AccountNotAllowedError('inactive');
  }
  return session;
};

export const requireV3TeacherLoginResult = (
  result: V3AuthLoginResult,
): V3AuthLoginResult => {
  if (result.kind === 'authenticated') {
    return {
      kind: 'authenticated',
      session: requireV3TeacherSession(result.session),
    };
  }
  return result;
};

export interface V3AuthClientConfig {
  baseUrl: string;
  deviceIdentifier: string;
  fetchImpl?: V3AuthFetch;
}

export interface V3AuthClient {
  login(email: string, password: string): Promise<V3AuthLoginResult>;
  verifyMfa(
    challengeUuid: string,
    code: string,
    verificationMethod: V3AuthMfaMethod,
  ): Promise<V3AuthSession>;
  getMe(accessToken: string): Promise<V3AuthUser>;
  logout(accessToken: string): Promise<void>;
}

export class V3AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V3AuthConfigurationError';
  }
}

export class V3AuthNetworkError extends Error {
  readonly causeValue: unknown;

  constructor(message: string, causeValue: unknown) {
    super(message);
    this.name = 'V3AuthNetworkError';
    this.causeValue = causeValue;
  }
}

export class V3AuthHttpError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly errors: Readonly<Record<string, unknown>> | null;

  constructor(
    status: number,
    message: string,
    code: string | null,
    errors: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'V3AuthHttpError';
    this.status = status;
    this.code = code;
    this.errors = errors ? Object.freeze({ ...errors }) : null;
  }
}

export class V3AuthContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V3AuthContractError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const normalizeV3BaseUrl = (baseUrl: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+(?::\d+)?(?:\/[^\s?#]*)?$/.test(normalized)) {
    throw new V3AuthConfigurationError(
      'Backend URL must be an absolute HTTP or HTTPS URL.',
    );
  }
  return normalized;
};

const requireText = (
  value: unknown,
  field: string,
  allowEmpty = false,
): string => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new V3AuthContractError(`V3 auth response requires ${field}.`);
  }
  return value;
};

const requireInstant = (value: unknown, field: string): string => {
  const result = requireText(value, field);
  if (!result.endsWith('Z') || Number.isNaN(Date.parse(result))) {
    throw new V3AuthContractError(
      `V3 auth response requires ${field} as a UTC ISO-8601 timestamp.`,
    );
  }
  return result;
};

const requireNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new V3AuthContractError(`V3 auth response requires numeric ${field}.`);
  }
  return value;
};

const requireBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new V3AuthContractError(`V3 auth response requires boolean ${field}.`);
  }
  return value;
};

const nullableText = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  return requireText(value, field, true);
};

const parseUser = (value: unknown): V3AuthUser => {
  if (!isObject(value)) {
    throw new V3AuthContractError('V3 auth response requires user data.');
  }

  return {
    userId: requireNumber(value.userId, 'user.userId'),
    schoolId: requireText(value.schoolId, 'user.schoolId'),
    firstName: requireText(value.firstName, 'user.firstName'),
    middleName: nullableText(value.middleName, 'user.middleName'),
    lastName: requireText(value.lastName, 'user.lastName'),
    suffix: nullableText(value.suffix, 'user.suffix'),
    email: requireText(value.email, 'user.email'),
    role: requireText(value.role, 'user.role'),
    status: requireText(value.status, 'user.status'),
    mfaRequired: requireBoolean(value.mfaRequired, 'user.mfaRequired'),
  };
};

export const parseV3AuthSession = (value: unknown): V3AuthSession => {
  if (!isObject(value)) {
    throw new V3AuthContractError('V3 auth response requires session data.');
  }
  const tokenType = requireText(value.tokenType, 'tokenType');
  if (tokenType !== 'Bearer') {
    throw new V3AuthContractError('V3 auth tokenType must be Bearer.');
  }

  return {
    tokenType,
    accessToken: requireText(value.accessToken, 'accessToken'),
    expiresAt: requireInstant(value.expiresAt, 'expiresAt'),
    user: parseUser(value.user),
  };
};

const parseMfaChallenge = (value: unknown): V3AuthMfaChallenge => {
  if (!isObject(value)) {
    throw new V3AuthContractError('V3 auth response requires an MFA challenge.');
  }
  const challengeUuid = requireText(value.challengeUuid, 'mfaChallenge.challengeUuid');
  if (!UUID_PATTERN.test(challengeUuid)) {
    throw new V3AuthContractError('MFA challenge UUID is invalid.');
  }
  if (!Array.isArray(value.verificationMethods)) {
    throw new V3AuthContractError('MFA verification methods are missing.');
  }
  const verificationMethods = value.verificationMethods.filter(
    (method): method is V3AuthMfaMethod =>
      method === 'authenticator' || method === 'recovery_code',
  );
  if (!verificationMethods.length) {
    throw new V3AuthContractError('No supported MFA verification method was returned.');
  }

  return {
    challengeUuid,
    expiresAt: requireText(value.expiresAt, 'mfaChallenge.expiresAt'),
    maximumAttempts: requireNumber(
      value.maximumAttempts,
      'mfaChallenge.maximumAttempts',
    ),
    verificationMethods,
    emailMasked: requireText(value.emailMasked, 'mfaChallenge.emailMasked'),
  };
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const readError = (
  status: number,
  value: unknown,
): { message: string; code: string | null; errors: Record<string, unknown> | null } => {
  const body = isObject(value) ? value : null;
  const errors = body && isObject(body.errors) ? body.errors : null;
  return {
    message:
      body && typeof body.message === 'string' && body.message.trim()
        ? body.message
        : `V3 authentication failed with status ${status}.`,
    code: errors && typeof errors.code === 'string' ? errors.code : null,
    errors,
  };
};

export const createV3AuthClient = (config: V3AuthClientConfig): V3AuthClient => {
  const baseUrl = normalizeV3BaseUrl(config.baseUrl);
  const deviceIdentifier = config.deviceIdentifier.trim();
  const fetchImpl = config.fetchImpl ?? v3Fetch;
  if (!deviceIdentifier) {
    throw new V3AuthConfigurationError('A device identifier is required.');
  }

  const request = async (
    path: string,
    init: RequestInit,
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch (error) {
      throw new V3AuthNetworkError('Unable to reach the V3 backend.', error);
    }

    const body = await readJson(response);
    if (!response.ok) {
      const details = readError(response.status, body);
      throw new V3AuthHttpError(
        response.status,
        details.message,
        details.code,
        details.errors,
      );
    }
    return body;
  };

  const readData = (value: unknown): unknown => {
    if (!isObject(value) || value.success !== true || !('data' in value)) {
      throw new V3AuthContractError('V3 auth envelope is invalid.');
    }
    return value.data;
  };

  return Object.freeze({
    login: async (email: string, password: string) => {
      const normalizedEmail = email.trim();
      if (!normalizedEmail || !password) {
        throw new V3AuthConfigurationError('Email and password are required.');
      }
      const body = await request(V3_AUTH_LOGIN_PATH, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          deviceIdentifier: deviceIdentifier.slice(0, 100),
        }),
      });
      const data = readData(body);
      if (isObject(data) && data.mfaRequired === true) {
        return {
          kind: 'mfa_required' as const,
          challenge: parseMfaChallenge(data.mfaChallenge),
        };
      }
      return {
        kind: 'authenticated' as const,
        session: parseV3AuthSession(data),
      };
    },
    verifyMfa: async (
      challengeUuid: string,
      code: string,
      verificationMethod: V3AuthMfaMethod,
    ) => {
      if (!UUID_PATTERN.test(challengeUuid)) {
        throw new V3AuthConfigurationError('MFA challenge UUID is invalid.');
      }
      if (!code.trim()) {
        throw new V3AuthConfigurationError('MFA code is required.');
      }
      const body = await request(V3_AUTH_MFA_LOGIN_VERIFY_PATH, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeUuid,
          code: code.trim(),
          verificationMethod,
          deviceIdentifier: deviceIdentifier.slice(0, 100),
        }),
      });
      return parseV3AuthSession(readData(body));
    },
    getMe: async (accessToken: string) => {
      const body = await request(V3_AUTH_ME_PATH, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken.trim()}`,
        },
      });
      return parseUser(readData(body));
    },
    logout: async (accessToken: string) => {
      await request(V3_AUTH_LOGOUT_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken.trim()}`,
        },
      });
    },
  });
};
