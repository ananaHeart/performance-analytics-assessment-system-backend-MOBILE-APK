import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { V3OfflineDiagnosticSnapshot } from '../database/v3/diagnosticRepository';
import {
  requireV3TeacherLoginResult,
  requireV3TeacherSession,
  V3AccountNotAllowedError,
  V3AuthHttpError,
  type V3AuthMfaChallenge,
  type V3AuthMfaMethod,
  type V3AuthSession,
} from '../services/v3/authClient';
import {
  defaultV3DiagnosticsConnection,
  getDefaultV3BaseUrl,
  type V3DiagnosticsConnectionAdapter,
} from '../services/v3/diagnosticsConnection';
import { V3SessionReauthenticationError } from '../services/v3/secureSessionService';
import { theme } from '../theme/tokens';
import { LoginLoading } from './LoginLoading';
import { Banner, Button, ScreenHeader, TextField, useDialog } from './ui';

// TCH-3 / TCH-9 / R2-6: the backend checks these only after the password
// matched, so they never reach the teacher as "Invalid email or password".
// Each code gets its own title and wording; the contract message keeps the
// backend's text because it carries the end date.
const ACCOUNT_STATUS_MESSAGES: Record<string, { title: string; message: string | null }> = {
  ACCOUNT_PENDING_APPROVAL: {
    title: 'Waiting for approval',
    message: 'Your account is verified, but the principal has not approved it yet. Please try again once it is approved.',
  },
  ACCOUNT_REJECTED: {
    title: 'Registration rejected',
    message: 'The principal rejected this registration. Please contact the principal.',
  },
  ACCOUNT_INACTIVE: {
    title: 'Account inactive',
    message: 'This account has been deactivated. Please contact the principal to restore access.',
  },
  ACCOUNT_ARCHIVED: {
    title: 'Account archived',
    message: 'This account is archived. Please contact the principal to restore access.',
  },
  ACCOUNT_LOCKED: {
    title: 'Account locked',
    message: 'This account is locked. Please contact the principal.',
  },
  ACCOUNT_CONTRACT_ENDED: {
    title: 'Contract ended',
    message: null,
  },
};

interface V3LoginFlowProps {
  request: { email: string; password: string };
  onClose: () => void;
  // Called instead of onClose when the account may not use the mobile app
  // (e.g. a principal), so the login form can be cleared.
  onAccountRejected?: () => void;
  onAuthenticated: (session: V3AuthSession, snapshot: V3OfflineDiagnosticSnapshot) => void;
  connectionAdapter?: V3DiagnosticsConnectionAdapter;
  baseUrl?: string;
}

export const V3LoginFlow = ({
  request,
  onClose,
  onAccountRejected = onClose,
  onAuthenticated,
  connectionAdapter = defaultV3DiagnosticsConnection,
  baseUrl = getDefaultV3BaseUrl(),
}: V3LoginFlowProps): React.JSX.Element => {
  const [isBusy, setIsBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<V3AuthMfaChallenge | null>(null);
  const [method, setMethod] = useState<V3AuthMfaMethod>('authenticator');
  const [code, setCode] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const session = useRef<V3AuthSession | null>(null);
  // A ref, so a new callback from the parent does not restart the login effect.
  const accountRejected = useRef(onAccountRejected);
  accountRejected.current = onAccountRejected;
  // Stable (the provider memoizes it), so it doesn't restart the login effect.
  const dialog = useDialog();

  const showError = useCallback((cause: unknown) => {
    if (cause instanceof V3AccountNotAllowedError) {
      session.current = null;
      setChallenge(null);
      dialog.info({ title: cause.title, message: cause.message });
      accountRejected.current();
      return;
    }
    const accountStatus = cause instanceof V3AuthHttpError && cause.code
      ? ACCOUNT_STATUS_MESSAGES[cause.code]
      : undefined;
    if (accountStatus) {
      session.current = null;
      setChallenge(null);
      dialog.info({
        title: accountStatus.title,
        message: accountStatus.message
          ?? ((cause as V3AuthHttpError).message || 'Please contact the principal.'),
      });
      accountRejected.current();
      return;
    }
    if (cause instanceof V3SessionReauthenticationError) {
      session.current = null;
      setChallenge(null);
    }
    setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
  }, [dialog]);

  const finishSignIn = useCallback(async (
    activeSession: V3AuthSession,
    isActive: () => boolean,
  ) => {
    session.current = requireV3TeacherSession(activeSession);
    const snapshot = await connectionAdapter.refresh(baseUrl, session.current);
    if (isActive()) onAuthenticated(activeSession, snapshot);
  }, [baseUrl, connectionAdapter, onAuthenticated]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    inFlight.current = true;
    session.current = null;
    setIsBusy(true);
    setError(null);
    setChallenge(null);
    setCode('');

    const signIn = async () => {
      try {
        const result = requireV3TeacherLoginResult(await connectionAdapter.login({ baseUrl, ...request }));
        if (!active) return;
        if (result.kind === 'mfa_required') {
          setChallenge(result.challenge);
          setMethod(result.challenge.verificationMethods[0]);
        } else {
          await finishSignIn(result.session, () => active);
        }
      } catch (cause) {
        if (active) showError(cause);
      } finally {
        if (active) {
          inFlight.current = false;
          setIsBusy(false);
        }
      }
    };
    signIn();
    return () => { active = false; mounted.current = false; };
  }, [baseUrl, connectionAdapter, finishSignIn, request, showError]);

  const verifyMfa = async () => {
    if (!challenge || !code.trim() || inFlight.current) return;
    inFlight.current = true;
    setIsBusy(true);
    setError(null);
    try {
      const verified = requireV3TeacherSession(await connectionAdapter.verifyMfa({
        baseUrl,
        challengeUuid: challenge.challengeUuid,
        code: code.trim(),
        verificationMethod: method,
      }));
      if (!mounted.current) return;
      setChallenge(null);
      setCode('');
      await finishSignIn(verified, () => mounted.current);
    } catch (cause) {
      if (mounted.current) showError(cause);
    } finally {
      if (mounted.current) {
        inFlight.current = false;
        setIsBusy(false);
      }
    }
  };

  const retryDownload = async () => {
    if (!session.current || inFlight.current) return;
    inFlight.current = true;
    setIsBusy(true);
    setError(null);
    try {
      await finishSignIn(session.current, () => mounted.current);
    } catch (cause) {
      if (mounted.current) showError(cause);
    } finally {
      if (mounted.current) {
        inFlight.current = false;
        setIsBusy(false);
      }
    }
  };

  const title = challenge ? 'Verify your identity' : 'Unable to sign in';
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        {isBusy || (!challenge && !error) ? <LoginLoading /> : (
          <>
            <ScreenHeader title={title} onClose={onClose} />
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {challenge ? (
                <>
                  <Text style={styles.description}>Enter your verification code for {challenge.emailMasked}.</Text>
                  {challenge.verificationMethods.length > 1 ? (
                    <View style={styles.methods}>
                      {challenge.verificationMethods.map(value => (
                        <Pressable
                          key={value}
                          style={({ pressed }) => [
                            styles.method,
                            method === value && styles.selectedMethod,
                            pressed && method !== value && styles.pressedMethod,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: method === value }}
                          onPress={() => { setMethod(value); setCode(''); setError(null); }}
                        >
                          <Text style={[styles.methodText, method === value && styles.selectedMethodText]}>
                            {value === 'authenticator' ? 'Authenticator' : 'Recovery code'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <TextField
                    label={method === 'authenticator' ? '6-digit code' : 'Recovery code'}
                    accessibilityLabel="Verification code"
                    placeholder={method === 'authenticator' ? '6-digit code' : 'Recovery code'}
                    value={code}
                    onChangeText={setCode}
                    keyboardType={method === 'authenticator' ? 'number-pad' : 'default'}
                    autoCapitalize={method === 'authenticator' ? 'none' : 'characters'}
                    autoCorrect={false}
                    textContentType="oneTimeCode"
                    onSubmitEditing={verifyMfa}
                  />
                </>
              ) : null}
              {error ? <Banner tone="danger" message={error} /> : null}
              {challenge ? (
                <Button
                  label="Verify"
                  onPress={verifyMfa}
                  disabled={!code.trim()}
                  fullWidth
                  accessibilityLabel="Verify and sign in"
                />
              ) : session.current ? (
                <Button label="Try again" onPress={retryDownload} fullWidth accessibilityLabel="Retry sign in" />
              ) : null}
              <Button label="Back to login" variant="link" onPress={onClose} fullWidth accessibilityLabel="Back to login" />
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  content: { flexGrow: 1, padding: theme.screenPadding, paddingTop: theme.spacing.xxl, gap: theme.spacing.lg },
  description: { ...theme.type.body, color: theme.colors.textSecondary },
  methods: { flexDirection: 'row', gap: theme.spacing.sm },
  method: {
    flex: 1,
    minHeight: theme.touchTarget,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMethod: { borderColor: theme.colors.primaryBorder, backgroundColor: theme.colors.primarySoft },
  pressedMethod: { backgroundColor: theme.colors.surfaceSunken },
  methodText: { ...theme.type.bodyStrong, color: theme.colors.textSecondary, textAlign: 'center' },
  selectedMethodText: { color: theme.colors.primary },
});
