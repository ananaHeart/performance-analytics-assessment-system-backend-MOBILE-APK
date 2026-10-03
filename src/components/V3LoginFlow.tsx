import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { V3OfflineDiagnosticSnapshot } from '../database/v3/diagnosticRepository';
import {
  requireV3TeacherLoginResult,
  requireV3TeacherSession,
  V3AccountNotAllowedError,
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
import { LoginLoading } from './LoginLoading';

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

  const showError = useCallback((cause: unknown) => {
    if (cause instanceof V3AccountNotAllowedError) {
      session.current = null;
      setChallenge(null);
      Alert.alert(cause.title, cause.message, [{ text: 'OK' }]);
      accountRejected.current();
      return;
    }
    if (cause instanceof V3SessionReauthenticationError) {
      session.current = null;
      setChallenge(null);
    }
    setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
  }, []);

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

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        {isBusy || (!challenge && !error) ? <LoginLoading /> : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{challenge ? 'Verify your identity' : 'Unable to sign in'}</Text>
            {challenge ? (
              <>
                <Text style={styles.description}>Enter your verification code for {challenge.emailMasked}.</Text>
                {challenge.verificationMethods.length > 1 ? (
                  <View style={styles.methods}>
                    {challenge.verificationMethods.map(value => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.method, method === value && styles.selectedMethod]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: method === value }}
                        onPress={() => { setMethod(value); setCode(''); setError(null); }}
                      >
                        <Text style={styles.methodText}>{value === 'authenticator' ? 'Authenticator' : 'Recovery code'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Verification code"
                  placeholder={method === 'authenticator' ? '6-digit code' : 'Recovery code'}
                  placeholderTextColor="#8B99AA"
                  value={code}
                  onChangeText={setCode}
                  keyboardType={method === 'authenticator' ? 'number-pad' : 'default'}
                  autoCapitalize={method === 'authenticator' ? 'none' : 'characters'}
                  autoCorrect={false}
                  onSubmitEditing={verifyMfa}
                />
              </>
            ) : null}
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            {challenge ? (
              <TouchableOpacity
                style={[styles.button, !code.trim() && styles.disabledButton]}
                onPress={verifyMfa}
                disabled={!code.trim()}
                accessibilityRole="button"
                accessibilityLabel="Verify and sign in"
              >
                <Text style={styles.buttonText}>Verify</Text>
              </TouchableOpacity>
            ) : session.current ? (
              <TouchableOpacity style={styles.button} onPress={retryDownload} accessibilityRole="button" accessibilityLabel="Retry sign in">
                <Text style={styles.buttonText}>Try again</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.backButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to login">
              <Text style={styles.backText}>Back to login</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 },
  title: { fontSize: 23, fontWeight: '800', color: '#17261B', textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 21, color: '#64748B', textAlign: 'center' },
  methods: { flexDirection: 'row', gap: 10 },
  method: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#DCE3E8', borderRadius: 8, alignItems: 'center' },
  selectedMethod: { borderColor: '#20B94B', backgroundColor: '#EDF8F0' },
  methodText: { color: '#43515C', fontSize: 13, fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#CBD5DC', borderRadius: 8, paddingHorizontal: 16, fontSize: 18, color: '#17261B' },
  error: { color: '#B42318', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { minHeight: 50, backgroundColor: '#20B94B', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.5 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  backButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
});
