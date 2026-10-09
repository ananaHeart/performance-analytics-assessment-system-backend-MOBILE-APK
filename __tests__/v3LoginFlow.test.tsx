import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { LoginLoading } from '../src/components/LoginLoading';
import { V3LoginFlow } from '../src/components/V3LoginFlow';
import type { V3OfflineDiagnosticSnapshot } from '../src/database/v3/diagnosticRepository';
import {
  V3AccountNotAllowedError,
  type V3AuthLoginResult,
  type V3AuthSession,
} from '../src/services/v3/authClient';
import type { V3DiagnosticsConnectionAdapter } from '../src/services/v3/diagnosticsConnection';
import { V3SessionReauthenticationError } from '../src/services/v3/secureSessionService';

jest.mock('../src/services/v3/diagnosticsConnection', () => ({
  defaultV3DiagnosticsConnection: {},
  getDefaultV3BaseUrl: () => 'http://127.0.0.1:8080',
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const REQUEST = { email: 'teacher@example.com', password: 'test-password' };
const SESSION: V3AuthSession = {
  tokenType: 'Bearer', accessToken: 'test-token', expiresAt: '2026-10-02T00:00:00Z',
  user: {
    userId: 1, schoolId: 'SCHOOL-001', firstName: 'Test', middleName: null,
    lastName: 'Teacher', suffix: null, email: REQUEST.email, role: 'teacher',
    status: 'active', mfaRequired: false,
  },
};
const SNAPSHOT: V3OfflineDiagnosticSnapshot = {
  status: 'ready', schemaVersion: 4, referenceData: null,
  activeSnapshot: {
    snapshotUuid: 'snapshot', generatedAt: '2026-10-01T00:00:00Z',
    downloadedAt: '2026-10-01T00:00:00Z', committedAt: '2026-10-01T00:00:00Z',
    teacherEmail: REQUEST.email, schoolId: 'SCHOOL-001',
  },
  counts: { classes: 0, classAssignments: 0, classLists: 0, students: 0, tests: 0,
    testAssignments: 0, testParts: 0, questions: 0, answerSheets: 0, readyManifests: 0 },
  classes: [], assessments: [], answerSheets: [], issues: [],
};
const MFA: V3AuthLoginResult = {
  kind: 'mfa_required',
  challenge: {
    challengeUuid: '00000000-0000-5000-8000-000000000099',
    expiresAt: '2026-10-02T00:00:00Z', maximumAttempts: 5,
    verificationMethods: ['authenticator', 'recovery_code'], emailMasked: 't***@example.com',
  },
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
};

describe('V3 login loading flow', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null;
  let adapter: jest.Mocked<V3DiagnosticsConnectionAdapter>;
  let onAuthenticated: jest.Mock;
  let onClose: jest.Mock;

  beforeEach(() => {
    renderer = null;
    adapter = {
      login: jest.fn().mockResolvedValue({ kind: 'authenticated', session: SESSION }),
      verifyMfa: jest.fn().mockResolvedValue(SESSION),
      refresh: jest.fn().mockResolvedValue(SNAPSHOT), restore: jest.fn(),
      clearSession: jest.fn(), logout: jest.fn(),
    };
    onAuthenticated = jest.fn();
    onClose = jest.fn();
  });

  afterEach(async () => {
    await ReactTestRenderer.act(async () => { renderer?.unmount(); });
  });

  const renderFlow = async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <V3LoginFlow request={REQUEST} connectionAdapter={adapter}
          onAuthenticated={onAuthenticated} onClose={onClose} />,
      );
    });
  };
  const screenText = () => renderer!.root.findAllByType(Text).map(node => node.props.children).join(' ');
  const expectNoDiagnostics = () => {
    expect(screenText()).not.toMatch(/Diagnostics|Download Latest|downloaded successfully|Continue to App|Snapshot|Backend URL/);
  };

  test('shows only loading until login AND the download finish, then enters the app automatically', async () => {
    const login = deferred<V3AuthLoginResult>();
    const download = deferred<V3OfflineDiagnosticSnapshot>();
    adapter.login.mockReturnValue(login.promise);
    adapter.refresh.mockReturnValue(download.promise);
    await renderFlow();
    expect(renderer!.root.findAllByType(LoginLoading)).toHaveLength(1);
    expectNoDiagnostics();
    expect(adapter.refresh).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => { login.resolve({ kind: 'authenticated', session: SESSION }); });
    expect(adapter.refresh).toHaveBeenCalledWith('http://127.0.0.1:8080', SESSION);
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(LoginLoading)).toHaveLength(1);
    expectNoDiagnostics();

    await ReactTestRenderer.act(async () => { download.resolve(SNAPSHOT); });
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalledWith(SESSION, SNAPSHOT);
    expectNoDiagnostics();
  });

  test('requires MFA and prevents duplicate verification requests while loading', async () => {
    adapter.login.mockResolvedValue(MFA);
    const verification = deferred<V3AuthSession>();
    adapter.verifyMfa.mockReturnValue(verification.promise);
    await renderFlow();
    expect(screenText()).toContain('Verify your identity');
    expect(adapter.refresh).not.toHaveBeenCalled();
    expectNoDiagnostics();
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TextInput).props.onChangeText('123456');
    });
    const verify = renderer!.root.findByProps({ accessibilityLabel: 'Verify and sign in' }).props.onPress;
    await ReactTestRenderer.act(async () => { verify(); verify(); });
    expect(adapter.verifyMfa).toHaveBeenCalledTimes(1);
    expect(adapter.verifyMfa).toHaveBeenCalledWith(expect.objectContaining({ code: '123456', verificationMethod: 'authenticator' }));
    expect(renderer!.root.findAllByType(LoginLoading)).toHaveLength(1);
    expect(onAuthenticated).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => { verification.resolve(SESSION); });
    expect(onAuthenticated).toHaveBeenCalledWith(SESSION, SNAPSHOT);
    expectNoDiagnostics();
  });

  test('keeps the MFA form for an invalid code and permits an advertised recovery code', async () => {
    adapter.login.mockResolvedValue(MFA);
    adapter.verifyMfa.mockRejectedValueOnce(new Error('Invalid verification code.'));
    await renderFlow();
    await ReactTestRenderer.act(async () => { renderer!.root.findByType(TextInput).props.onChangeText('000000'); });
    await ReactTestRenderer.act(async () => { await renderer!.root.findByProps({ accessibilityLabel: 'Verify and sign in' }).props.onPress(); });
    expect(screenText()).toContain('Invalid verification code.');
    expect(adapter.refresh).not.toHaveBeenCalled();
    const recovery = renderer!.root.findAllByProps({ accessibilityRole: 'button' })
      .find(button => button.findAllByType(Text).some(text => text.props.children === 'Recovery code'))!;
    await ReactTestRenderer.act(async () => { recovery.props.onPress(); });
    await ReactTestRenderer.act(async () => { renderer!.root.findByType(TextInput).props.onChangeText('RECOVERY-CODE'); });
    await ReactTestRenderer.act(async () => { await renderer!.root.findByProps({ accessibilityLabel: 'Verify and sign in' }).props.onPress(); });
    expect(adapter.verifyMfa).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'RECOVERY-CODE', verificationMethod: 'recovery_code' }));
    expect(onAuthenticated).toHaveBeenCalledWith(SESSION, SNAPSHOT);
  });

  test('retries a failed download without resubmitting login credentials', async () => {
    adapter.refresh.mockRejectedValueOnce(new Error('Connection interrupted.'));
    await renderFlow();
    expect(screenText()).toContain('Connection interrupted.');
    expect(onAuthenticated).not.toHaveBeenCalled();
    expectNoDiagnostics();
    const download = deferred<V3OfflineDiagnosticSnapshot>();
    adapter.refresh.mockReturnValueOnce(download.promise);
    const retry = renderer!.root.findByProps({ accessibilityLabel: 'Retry sign in' }).props.onPress;
    await ReactTestRenderer.act(async () => { retry(); retry(); });
    expect(adapter.login).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledTimes(2);
    expect(renderer!.root.findAllByType(LoginLoading)).toHaveLength(1);
    await ReactTestRenderer.act(async () => { download.resolve(SNAPSHOT); });
    expect(onAuthenticated).toHaveBeenCalledWith(SESSION, SNAPSHOT);
  });

  test('requires a fresh login when the download rejects an expired or revoked session', async () => {
    adapter.refresh.mockRejectedValue(new V3SessionReauthenticationError('HTTP_401', 'Sign in again.'));
    await renderFlow();
    expect(screenText()).toContain('Sign in again.');
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Retry sign in' })).toHaveLength(0);
    await ReactTestRenderer.act(async () => { renderer!.root.findByProps({ accessibilityLabel: 'Back to login' }).props.onPress(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  test('shows login errors without opening diagnostics or downloading data', async () => {
    adapter.login.mockRejectedValue(new Error('Invalid email or password.'));
    await renderFlow();
    expect(screenText()).toContain('Invalid email or password.');
    expect(renderer!.root.findAllByType(LoginLoading)).toHaveLength(0);
    expectNoDiagnostics();
    expect(adapter.refresh).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  describe('accounts that may not use the mobile app', () => {
    let alert: jest.SpyInstance;
    let onAccountRejected: jest.Mock;

    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      onAccountRejected = jest.fn();
    });
    afterEach(() => { alert.mockRestore(); });

    const renderWithRejection = async () => {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <V3LoginFlow request={REQUEST} connectionAdapter={adapter}
            onAuthenticated={onAuthenticated} onClose={onClose}
            onAccountRejected={onAccountRejected} />,
        );
      });
    };
    const expectFriendlyPopUp = () => {
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        'Teacher accounts only',
        'This mobile app is for teachers. Please log in to Marka on a computer to use your principal account.',
        [{ text: 'OK' }],
      );
      expect(onAccountRejected).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(onAuthenticated).not.toHaveBeenCalled();
      expect(adapter.refresh).not.toHaveBeenCalled();
      expect(screenText()).not.toMatch(/teacher accounts|Unable to sign in/);
    };

    test('shows a friendly pop-up for a principal and returns to the login form', async () => {
      adapter.login.mockRejectedValue(new V3AccountNotAllowedError('not_teacher'));
      await renderWithRejection();
      expectFriendlyPopUp();
    });

    test('shows the same pop-up when the role is only known after MFA', async () => {
      adapter.login.mockResolvedValue(MFA);
      adapter.verifyMfa.mockRejectedValue(new V3AccountNotAllowedError('not_teacher'));
      await renderWithRejection();
      await ReactTestRenderer.act(async () => { renderer!.root.findByType(TextInput).props.onChangeText('123456'); });
      await ReactTestRenderer.act(async () => {
        await renderer!.root.findByProps({ accessibilityLabel: 'Verify and sign in' }).props.onPress();
      });
      expectFriendlyPopUp();
    });

    test('falls back to onClose when no rejection handler is given', async () => {
      adapter.login.mockRejectedValue(new V3AccountNotAllowedError('inactive'));
      await renderFlow();
      expect(alert).toHaveBeenCalledWith(
        'Account not active yet',
        "Your teacher account is not active yet. Please wait for the principal's approval, or contact your principal.",
        [{ text: 'OK' }],
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  test('does not enter the app if the login flow closes before the download resolves', async () => {
    const download = deferred<V3OfflineDiagnosticSnapshot>();
    adapter.refresh.mockReturnValue(download.promise);
    await renderFlow();
    await ReactTestRenderer.act(async () => { renderer!.unmount(); });
    renderer = null;
    await ReactTestRenderer.act(async () => { download.resolve(SNAPSHOT); });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
