import { Platform } from 'react-native';

import { V3_API_BASE_URL } from '../../config/api';
import { getV3OfflineDiagnosticSnapshot, type V3OfflineDiagnosticSnapshot } from '../../database/v3/diagnosticRepository';
import {
  createV3AuthClient,
  requireV3TeacherSession,
  type V3AuthLoginResult,
  type V3AuthMfaMethod,
  type V3AuthSession,
} from './authClient';
import { createV3MobileReadClient } from './mobileReadClient';
import { createV3OfflineDataService } from './offlineDataService';
import {
  createV3SecureSessionService,
  type V3SessionRestoreResult,
} from './secureSessionService';

export const V3_LOCAL_STAGING_BASE_URL = 'http://127.0.0.1:8080' as const;
export const V3_PHYSICAL_DEVICE_BASE_URL = V3_LOCAL_STAGING_BASE_URL;
export const V3_EMULATOR_BASE_URL = 'http://10.0.2.2:8080' as const;

// Set in src/config/api.ts: the Render backend in a cloud build, otherwise
// the laptop (V3_LOCAL_STAGING_BASE_URL) through adb reverse.
export const getDefaultV3BaseUrl = (): string => V3_API_BASE_URL;

export const V3_BASE_URL = getDefaultV3BaseUrl();

export const getV3DeviceIdentifier = (): string => {
  const constants = Platform.constants as Record<string, unknown>;
  const parts = ['Brand', 'Manufacturer', 'Model', 'Product', 'Fingerprint']
    .map(key => String(constants[key] ?? '').trim())
    .filter(Boolean);
  return (parts.join('|') || `${Platform.OS}-device`).slice(0, 100);
};

export interface V3DiagnosticsLoginInput {
  baseUrl: string;
  email: string;
  password: string;
}

export interface V3DiagnosticsMfaInput {
  baseUrl: string;
  challengeUuid: string;
  code: string;
  verificationMethod: V3AuthMfaMethod;
}

export interface V3DiagnosticsConnectionAdapter {
  restore(): Promise<V3SessionRestoreResult>;
  clearSession(): Promise<void>;
  login(input: V3DiagnosticsLoginInput): Promise<V3AuthLoginResult>;
  verifyMfa(input: V3DiagnosticsMfaInput): Promise<V3AuthSession>;
  refresh(
    baseUrl: string,
    session: V3AuthSession,
  ): Promise<V3OfflineDiagnosticSnapshot>;
  logout(baseUrl: string, session: V3AuthSession): Promise<void>;
}

const authClient = (baseUrl: string) =>
  createV3AuthClient({
    baseUrl,
    deviceIdentifier: getV3DeviceIdentifier(),
  });

const secureSession = createV3SecureSessionService();

// A principal (or an inactive teacher) still gets a real server session from
// a successful login. End it at once so no token is left behind on the
// server, and never save it on the phone.
const requireTeacherOrLogout = async (
  baseUrl: string,
  session: V3AuthSession,
): Promise<V3AuthSession> => {
  try {
    return requireV3TeacherSession(session);
  } catch (error) {
    await authClient(baseUrl).logout(session.accessToken).catch(logoutError => {
      console.log('V3 AUTH: Logout of a rejected account failed.', logoutError);
    });
    throw error;
  }
};

export const defaultV3DiagnosticsConnection: V3DiagnosticsConnectionAdapter = {
  restore: () => secureSession.restore(),
  clearSession: () => secureSession.clear(),
  login: async input => {
    const result = await authClient(input.baseUrl).login(input.email, input.password);
    if (result.kind === 'mfa_required') return result;
    const session = await requireTeacherOrLogout(input.baseUrl, result.session);
    await secureSession.save(input.baseUrl, session);
    return { kind: 'authenticated', session };
  },
  verifyMfa: async input => {
    const session = await requireTeacherOrLogout(
      input.baseUrl,
      await authClient(input.baseUrl).verifyMfa(
        input.challengeUuid,
        input.code,
        input.verificationMethod,
      ),
    );
    await secureSession.save(input.baseUrl, session);
    return session;
  },
  refresh: async (baseUrl, session) => {
    const activeSession = await secureSession.requireActive(baseUrl, session);
    try {
      const readClient = createV3MobileReadClient({
        baseUrl,
        getSessionToken: () => activeSession.accessToken,
      });
      await createV3OfflineDataService(readClient).refreshOfflineBaseline();
      return getV3OfflineDiagnosticSnapshot(undefined, activeSession.user.userId);
    } catch (error) {
      return secureSession.rethrowProtectedError(error);
    }
  },
  logout: async (baseUrl, session) => {
    try {
      await authClient(baseUrl).logout(session.accessToken);
    } finally {
      await secureSession.clear();
    }
  },
};
