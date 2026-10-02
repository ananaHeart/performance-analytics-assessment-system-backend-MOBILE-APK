import type { V3SecureSessionStore } from '../../native/v3SecureSession';
import { nativeV3SecureSessionStore } from '../../native/v3SecureSession';
import {
  normalizeV3BaseUrl,
  parseV3AuthSession,
  requireV3TeacherSession,
  type V3AuthSession,
} from './authClient';

const STORAGE_VERSION = 1 as const;

interface V3StoredSession {
  storageVersion: typeof STORAGE_VERSION;
  backendUrl: string;
  savedAt: string;
  session: V3AuthSession;
}

export type V3SessionRestoreResult =
  | { kind: 'none' }
  | { kind: 'restored'; backendUrl: string; session: V3AuthSession }
  | { kind: 'expired'; backendUrl: string; email: string }
  | {
      kind: 'reauthentication_required';
      backendUrl: string | null;
      email: string | null;
      message: string;
    }
  | {
      kind: 'offline';
      backendUrl: string;
      email: string;
      message: string;
    };

export class V3SessionReauthenticationError extends Error {
  readonly code:
    | 'SESSION_MISSING'
    | 'SESSION_EXPIRED'
    | 'SESSION_MISMATCH'
    | 'HTTP_401';

  constructor(
    code: V3SessionReauthenticationError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'V3SessionReauthenticationError';
    this.code = code;
  }
}

export interface V3SecureSessionService {
  save(baseUrl: string, session: V3AuthSession): Promise<void>;
  restore(): Promise<V3SessionRestoreResult>;
  requireActive(baseUrl: string, session: V3AuthSession): Promise<V3AuthSession>;
  rethrowProtectedError(error: unknown): Promise<never>;
  clear(): Promise<void>;
}

interface V3SecureSessionServiceOptions {
  store?: V3SecureSessionStore;
  now?: () => Date;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseStoredSession = (value: string): V3StoredSession => {
  const parsed = JSON.parse(value) as unknown;
  if (!isObject(parsed) || parsed.storageVersion !== STORAGE_VERSION) {
    throw new Error('Unsupported secure-session record.');
  }
  if (typeof parsed.backendUrl !== 'string' || typeof parsed.savedAt !== 'string') {
    throw new Error('Secure-session ownership metadata is incomplete.');
  }
  if (!parsed.savedAt.endsWith('Z') || Number.isNaN(Date.parse(parsed.savedAt))) {
    throw new Error('Secure-session save time is invalid.');
  }
  return {
    storageVersion: STORAGE_VERSION,
    backendUrl: normalizeV3BaseUrl(parsed.backendUrl),
    savedAt: parsed.savedAt,
    session: requireV3TeacherSession(parseV3AuthSession(parsed.session)),
  };
};

const sameOwner = (left: V3AuthSession, right: V3AuthSession): boolean =>
  left.accessToken === right.accessToken &&
  left.user.userId === right.user.userId &&
  left.user.schoolId === right.user.schoolId;

const sessionExpired = (session: V3AuthSession, now: Date): boolean =>
  Date.parse(session.expiresAt) <= now.getTime();

export const createV3SecureSessionService = (
  options: V3SecureSessionServiceOptions = {},
): V3SecureSessionService => {
  const store = options.store ?? nativeV3SecureSessionStore;
  const now = options.now ?? (() => new Date());

  const clear = (): Promise<void> => store.clear();

  const save = async (baseUrl: string, session: V3AuthSession): Promise<void> => {
    const normalizedUrl = normalizeV3BaseUrl(baseUrl);
    const activeSession = requireV3TeacherSession(session);
    if (sessionExpired(activeSession, now())) {
      await clear();
      throw new V3SessionReauthenticationError(
        'SESSION_EXPIRED',
        'The V3 session has expired. Sign in again.',
      );
    }
    const value: V3StoredSession = {
      storageVersion: STORAGE_VERSION,
      backendUrl: normalizedUrl,
      savedAt: now().toISOString(),
      session: activeSession,
    };
    await store.save(JSON.stringify(value));
  };

  const loadStored = async (): Promise<V3StoredSession | null> => {
    const value = await store.load();
    if (value === null) return null;
    try {
      return parseStoredSession(value);
    } catch {
      await clear();
      return null;
    }
  };

  return Object.freeze({
    save,
    // Trusts the stored token as-is (checking only its own locally-known
    // expiry) instead of making a live getMe() call to re-validate it on
    // every restore. That live call used to run on every app launch and any
    // network hiccup during it (routine on a physical device over adb
    // reverse) silently downgraded a perfectly valid session to "offline" or
    // "reauthentication_required" - forcing a real teacher to log in (and
    // clear MFA) again for no actual security reason. If the token really
    // has been revoked, the first real API call 401s and
    // rethrowProtectedError() clears it then - same end state, just not
    // checked eagerly and unreliably at every single launch.
    restore: async () => {
      const storedText = await store.load();
      if (storedText === null) return { kind: 'none' as const };

      let stored: V3StoredSession;
      try {
        stored = parseStoredSession(storedText);
      } catch {
        await clear();
        return {
          kind: 'reauthentication_required' as const,
          backendUrl: null,
          email: null,
          message:
            'The saved V3 session was invalid and has been cleared. Sign in again.',
        };
      }

      if (sessionExpired(stored.session, now())) {
        await clear();
        return {
          kind: 'expired' as const,
          backendUrl: stored.backendUrl,
          email: stored.session.user.email,
        };
      }

      return {
        kind: 'restored' as const,
        backendUrl: stored.backendUrl,
        session: stored.session,
      };
    },
    requireActive: async (baseUrl: string, session: V3AuthSession) => {
      const stored = await loadStored();
      if (!stored) {
        throw new V3SessionReauthenticationError(
          'SESSION_MISSING',
          'The secure V3 session is unavailable. Sign in again.',
        );
      }
      if (sessionExpired(stored.session, now())) {
        await clear();
        throw new V3SessionReauthenticationError(
          'SESSION_EXPIRED',
          'The V3 session has expired. Sign in again.',
        );
      }
      if (
        stored.backendUrl !== normalizeV3BaseUrl(baseUrl) ||
        !sameOwner(stored.session, session)
      ) {
        throw new V3SessionReauthenticationError(
          'SESSION_MISMATCH',
          'The V3 session does not match this backend and local owner workspace.',
        );
      }
      return stored.session;
    },
    rethrowProtectedError: async (error: unknown) => {
      if (
        isObject(error) &&
        typeof error.status === 'number' &&
        error.status === 401
      ) {
        await clear();
        throw new V3SessionReauthenticationError(
          'HTTP_401',
          'The V3 session is no longer authorized. Sign in again.',
        );
      }
      throw error;
    },
    clear,
  });
};
