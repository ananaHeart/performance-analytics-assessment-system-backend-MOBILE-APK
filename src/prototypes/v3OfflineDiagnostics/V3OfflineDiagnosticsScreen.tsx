import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileCheck2,
  LogIn,
  LogOut,
  RefreshCw,
  School,
  ShieldCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react-native';

import {
  getV3OfflineDiagnosticSnapshot,
  type V3OfflineDiagnosticSnapshot,
} from '../../database/v3/diagnosticRepository';
import { initV3Database } from '../../database/v3/database';
import {
  requireV3TeacherLoginResult,
  type V3AuthMfaChallenge,
  type V3AuthMfaMethod,
  type V3AuthSession,
} from '../../services/v3/authClient';
import {
  defaultV3DiagnosticsConnection,
  getDefaultV3BaseUrl,
  type V3DiagnosticsConnectionAdapter,
} from '../../services/v3/diagnosticsConnection';
import { V3SessionReauthenticationError } from '../../services/v3/secureSessionService';

interface V3OfflineDiagnosticsScreenProps {
  visible: boolean;
  onClose: () => void;
  onAuthenticated?: (
    session: V3AuthSession,
    snapshot: V3OfflineDiagnosticSnapshot,
  ) => void;
  loadSnapshot?: () => Promise<V3OfflineDiagnosticSnapshot>;
  connectionAdapter?: V3DiagnosticsConnectionAdapter;
  defaultBaseUrl?: string;
  initialLoginRequest?: {
    requestId: number;
    email: string;
    password: string;
  } | null;
}

const defaultLoadSnapshot = async (): Promise<V3OfflineDiagnosticSnapshot> => {
  await initV3Database();
  return getV3OfflineDiagnosticSnapshot();
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const shortUuid = (value: string): string =>
  `${value.slice(0, 8)}...${value.slice(-4)}`;

const statusColor = (status: V3OfflineDiagnosticSnapshot['status']): string => {
  if (status === 'ready') return '#16863A';
  if (status === 'attention') return '#B45309';
  return '#64748B';
};

const statusTitle = (status: V3OfflineDiagnosticSnapshot['status']): string => {
  if (status === 'ready') return 'Local V3 data ready';
  if (status === 'attention') return 'Local V3 data needs attention';
  return 'No V3 download yet';
};

interface MetricProps {
  value: number;
  label: string;
}

const Metric = ({ value, label }: MetricProps): React.JSX.Element => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const SectionHeader = ({ title }: { title: string }): React.JSX.Element => (
  <Text style={styles.sectionTitle}>{title}</Text>
);

export const V3OfflineDiagnosticsScreen = ({
  visible,
  onClose,
  onAuthenticated,
  loadSnapshot = defaultLoadSnapshot,
  connectionAdapter = defaultV3DiagnosticsConnection,
  defaultBaseUrl = getDefaultV3BaseUrl(),
  initialLoginRequest = null,
}: V3OfflineDiagnosticsScreenProps): React.JSX.Element => {
  const [snapshot, setSnapshot] = useState<V3OfflineDiagnosticSnapshot | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState(defaultBaseUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<V3AuthSession | null>(null);
  const [hasUnverifiedSavedSession, setHasUnverifiedSavedSession] = useState(false);
  const [mfaChallenge, setMfaChallenge] =
    useState<V3AuthMfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] =
    useState<V3AuthMfaMethod>('authenticator');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await loadSnapshot());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to read the local V3 database.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadSnapshot]);

  const refreshFromBackend = useCallback(
    async (activeSession: V3AuthSession, activeBaseUrl: string) => {
      const nextSnapshot = await connectionAdapter.refresh(
        activeBaseUrl,
        activeSession,
      );
      setSnapshot(nextSnapshot);
      setConnectionMessage('Authenticated V3 data downloaded successfully.');
      return nextSnapshot;
    },
    [connectionAdapter],
  );

  const connectWithCredentials = useCallback(async (
    activeBaseUrl: string,
    activeEmail: string,
    activePassword: string,
  ) => {
    setIsConnecting(true);
    setError(null);
    setConnectionMessage(null);
    try {
      const result = requireV3TeacherLoginResult(
        await connectionAdapter.login({
          baseUrl: activeBaseUrl,
          email: activeEmail,
          password: activePassword,
        }),
      );
      if (result.kind === 'mfa_required') {
        setMfaChallenge(result.challenge);
        setMfaMethod(result.challenge.verificationMethods[0]);
        setPassword('');
        setConnectionMessage('Password accepted. Complete authenticator verification.');
        return;
      }

      setSession(result.session);
      setHasUnverifiedSavedSession(false);
      setPassword('');
      setMfaChallenge(null);
      const nextSnapshot = await refreshFromBackend(result.session, activeBaseUrl);
      onAuthenticated?.(result.session, nextSnapshot);
    } catch (connectError) {
      if (connectError instanceof V3SessionReauthenticationError) {
        setSession(null);
      }
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'Unable to connect to the V3 backend.',
      );
    } finally {
      setIsConnecting(false);
    }
  }, [connectionAdapter, onAuthenticated, refreshFromBackend]);

  const handleConnect = useCallback(async () => {
    await connectWithCredentials(backendUrl, email, password);
  }, [backendUrl, connectWithCredentials, email, password]);

  useEffect(() => {
    if (!visible || !initialLoginRequest) return;
    setBackendUrl(defaultBaseUrl);
    setEmail(initialLoginRequest.email);
    setPassword(initialLoginRequest.password);
    connectWithCredentials(
      defaultBaseUrl,
      initialLoginRequest.email,
      initialLoginRequest.password,
    );
  }, [
    connectWithCredentials,
    defaultBaseUrl,
    initialLoginRequest,
    visible,
  ]);

  const handleVerifyMfa = useCallback(async () => {
    if (!mfaChallenge) return;
    setIsConnecting(true);
    setError(null);
    try {
      const nextSession = await connectionAdapter.verifyMfa({
        baseUrl: backendUrl,
        challengeUuid: mfaChallenge.challengeUuid,
        code: mfaCode,
        verificationMethod: mfaMethod,
      });
      setSession(nextSession);
      setHasUnverifiedSavedSession(false);
      setMfaChallenge(null);
      setMfaCode('');
      const nextSnapshot = await refreshFromBackend(nextSession, backendUrl);
      onAuthenticated?.(nextSession, nextSnapshot);
    } catch (verifyError) {
      if (verifyError instanceof V3SessionReauthenticationError) {
        setSession(null);
      }
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : 'Unable to verify the MFA code.',
      );
    } finally {
      setIsConnecting(false);
    }
  }, [
    backendUrl,
    connectionAdapter,
    mfaChallenge,
    mfaCode,
    mfaMethod,
    onAuthenticated,
    refreshFromBackend,
  ]);

  const handleNetworkRefresh = useCallback(async () => {
    if (!session) {
      await load();
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      await refreshFromBackend(session, backendUrl);
    } catch (refreshError) {
      if (refreshError instanceof V3SessionReauthenticationError) {
        setSession(null);
      }
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to refresh V3 data.',
      );
    } finally {
      setIsConnecting(false);
    }
  }, [backendUrl, load, refreshFromBackend, session]);

  const handleDisconnect = useCallback(async () => {
    if (!session) return;
    setIsConnecting(true);
    setError(null);
    try {
      await connectionAdapter.logout(backendUrl, session);
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? `${logoutError.message} The local session was cleared.`
          : 'Logout failed. The local session was cleared.',
      );
    } finally {
      setSession(null);
      setHasUnverifiedSavedSession(false);
      setMfaChallenge(null);
      setMfaCode('');
      setConnectionMessage('V3 session disconnected. Local downloaded data remains available.');
      setIsConnecting(false);
    }
  }, [backendUrl, connectionAdapter, session]);

  const handleClearSavedSession = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectionAdapter.clearSession();
      setHasUnverifiedSavedSession(false);
      setConnectionMessage(
        'Saved V3 credential cleared. Local downloaded data remains available.',
      );
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : 'Unable to clear the saved V3 credential.',
      );
    } finally {
      setIsConnecting(false);
    }
  }, [connectionAdapter]);

  useEffect(() => {
    if (!visible || initialLoginRequest) return;
    let active = true;
    load();
    setIsConnecting(true);
    connectionAdapter
      .restore()
      .then(result => {
        if (!active) return;
        if (result.kind === 'none') return;
        if (result.backendUrl) setBackendUrl(result.backendUrl);
        if ('email' in result && result.email) setEmail(result.email);
        if (result.kind === 'restored') {
          setSession(result.session);
          setHasUnverifiedSavedSession(false);
          setConnectionMessage('Secure V3 session restored and verified with /me.');
          return;
        }
        setSession(null);
        if (result.kind === 'expired') {
          setHasUnverifiedSavedSession(false);
          setError('The saved V3 session expired and was cleared. Sign in again.');
          return;
        }
        setHasUnverifiedSavedSession(result.kind === 'offline');
        setError(result.message);
      })
      .catch(restoreError => {
        if (!active) return;
        setSession(null);
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : 'Unable to restore the protected V3 session.',
        );
      })
      .finally(() => {
        if (active) setIsConnecting(false);
      });
    return () => {
      active = false;
    };
  }, [connectionAdapter, initialLoginRequest, load, visible]);

  const isBusy = isLoading || isConnecting;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClose}
            accessibilityLabel="Close V3 diagnostics"
          >
            <X size={22} color="#17261B" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>V3 Data Diagnostics</Text>
            <Text style={styles.headerSubtitle}>AssessmentStorageV3.db</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleNetworkRefresh()}
            disabled={isBusy}
            accessibilityLabel="Refresh V3 diagnostics"
          >
            {isBusy ? (
              <ActivityIndicator color="#20B94B" size="small" />
            ) : (
              <RefreshCw size={20} color="#20B94B" strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader title="Backend Connection" />
          <View style={styles.connectionBand}>
            {session ? (
              <>
                <View style={styles.connectedRow}>
                  <View style={styles.connectedIcon}>
                    <Wifi size={20} color="#16863A" strokeWidth={2.5} />
                  </View>
                  <View style={styles.connectionCopy}>
                    <Text style={styles.connectionTitle}>V3 session connected</Text>
                    <Text style={styles.connectionMeta}>{session.user.email}</Text>
                    <Text style={styles.connectionMeta}>{backendUrl}</Text>
                  </View>
                </View>
                <View style={styles.connectionActions}>
                  <TouchableOpacity
                    style={styles.primaryConnectionButton}
                    onPress={() => handleNetworkRefresh()}
                    disabled={isBusy}
                    accessibilityLabel="Download latest V3 data"
                  >
                    {isConnecting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <RefreshCw size={17} color="#FFFFFF" strokeWidth={2.5} />
                    )}
                    <Text style={styles.primaryConnectionText}>Download Latest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryConnectionButton}
                    onPress={() => handleDisconnect()}
                    disabled={isBusy}
                    accessibilityLabel="Disconnect V3 session"
                  >
                    <LogOut size={17} color="#43515C" strokeWidth={2.4} />
                    <Text style={styles.secondaryConnectionText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
                {snapshot?.activeSnapshot && onAuthenticated ? (
                  <TouchableOpacity
                    style={styles.primaryConnectionButton}
                    onPress={() => onAuthenticated(session, snapshot)}
                    disabled={isBusy}
                    accessibilityLabel="Continue to the authenticated app"
                  >
                    <LogIn size={17} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.primaryConnectionText}>Continue to App</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : mfaChallenge ? (
              <>
                <View style={styles.connectedRow}>
                  <View style={styles.mfaIcon}>
                    <ShieldCheck size={20} color="#9A5B06" strokeWidth={2.5} />
                  </View>
                  <View style={styles.connectionCopy}>
                    <Text style={styles.connectionTitle}>Authenticator required</Text>
                    <Text style={styles.connectionMeta}>
                      {mfaChallenge.emailMasked} | maximum {mfaChallenge.maximumAttempts} attempts
                    </Text>
                  </View>
                </View>
                <View style={styles.methodRow}>
                  {mfaChallenge.verificationMethods.map(method => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.methodButton,
                        mfaMethod === method && styles.methodButtonActive,
                      ]}
                      onPress={() => setMfaMethod(method)}
                    >
                      <Text
                        style={[
                          styles.methodText,
                          mfaMethod === method && styles.methodTextActive,
                        ]}
                      >
                        {method === 'authenticator' ? 'Authenticator' : 'Recovery Code'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.connectionInput}
                  value={mfaCode}
                  onChangeText={setMfaCode}
                  placeholder={
                    mfaMethod === 'authenticator' ? '6-digit code' : 'Recovery code'
                  }
                  placeholderTextColor="#8B99AA"
                  autoCapitalize="characters"
                  keyboardType={mfaMethod === 'authenticator' ? 'number-pad' : 'default'}
                  accessibilityLabel="V3 MFA code"
                />
                <TouchableOpacity
                  style={styles.primaryConnectionButton}
                  onPress={() => handleVerifyMfa()}
                  disabled={isBusy}
                  accessibilityLabel="Verify V3 MFA and download"
                >
                  {isConnecting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <ShieldCheck size={17} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={styles.primaryConnectionText}>Verify and Download</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.connectionLabel}>Backend URL</Text>
                <TextInput
                  style={styles.connectionInput}
                  value={backendUrl}
                  onChangeText={setBackendUrl}
                  placeholder="http://localhost:8080"
                  placeholderTextColor="#8B99AA"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  accessibilityLabel="V3 backend URL"
                />
                <Text style={styles.connectionLabel}>Teacher Email</Text>
                <TextInput
                  style={styles.connectionInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="teacher@example.com"
                  placeholderTextColor="#8B99AA"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  accessibilityLabel="V3 teacher email"
                />
                <Text style={styles.connectionLabel}>Password</Text>
                <TextInput
                  style={styles.connectionInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#8B99AA"
                  secureTextEntry
                  accessibilityLabel="V3 teacher password"
                />
                <TouchableOpacity
                  style={styles.primaryConnectionButton}
                  onPress={() => handleConnect()}
                  disabled={isBusy}
                  accessibilityLabel="Connect and download V3 data"
                >
                  {isConnecting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <LogIn size={17} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={styles.primaryConnectionText}>Connect and Download</Text>
                </TouchableOpacity>
                {hasUnverifiedSavedSession ? (
                  <TouchableOpacity
                    style={styles.secondaryConnectionButton}
                    onPress={() => handleClearSavedSession()}
                    disabled={isBusy}
                    accessibilityLabel="Clear saved V3 session"
                  >
                    <LogOut size={17} color="#43515C" strokeWidth={2.4} />
                    <Text style={styles.secondaryConnectionText}>Clear Saved Session</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.connectionHint}>
                  USB staging: adb reverse tcp:8080 tcp:8080. Session credentials are protected by Android Keystore.
                </Text>
              </>
            )}
          </View>

          {connectionMessage ? (
            <View style={styles.successBand}>
              <CheckCircle2 size={18} color="#16863A" strokeWidth={2.4} />
              <Text style={styles.successText}>{connectionMessage}</Text>
            </View>
          ) : null}

          {error ? (
            <View
              style={styles.errorBand}
              accessibilityLabel="V3 diagnostics error"
            >
              <AlertCircle size={21} color="#B42318" strokeWidth={2.4} />
              <View style={styles.bandCopy}>
                <Text style={styles.errorTitle}>V3 session or data issue</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </View>
          ) : null}

          {!snapshot && isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#20B94B" size="large" />
              <Text style={styles.loadingText}>Reading local V3 data...</Text>
            </View>
          ) : null}

          {snapshot ? (
            <>
              <View style={styles.statusBand}>
                <View
                  style={[
                    styles.statusIcon,
                    { backgroundColor: `${statusColor(snapshot.status)}14` },
                  ]}
                >
                  {snapshot.status === 'ready' ? (
                    <CheckCircle2
                      size={23}
                      color={statusColor(snapshot.status)}
                      strokeWidth={2.5}
                    />
                  ) : snapshot.status === 'attention' ? (
                    <AlertCircle
                      size={23}
                      color={statusColor(snapshot.status)}
                      strokeWidth={2.5}
                    />
                  ) : (
                    <Database
                      size={22}
                      color={statusColor(snapshot.status)}
                      strokeWidth={2.4}
                    />
                  )}
                </View>
                <View style={styles.bandCopy}>
                  <Text style={styles.statusTitle}>
                    {statusTitle(snapshot.status)}
                  </Text>
                  <Text style={styles.statusMeta}>
                    Schema {snapshot.schemaVersion ?? 'not initialized'}
                  </Text>
                </View>
              </View>

              <SectionHeader title="Snapshot" />
              <View style={styles.sectionBand}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Teacher</Text>
                  <Text style={styles.detailValue}>
                    {snapshot.activeSnapshot?.teacherEmail ?? 'Not downloaded'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>School</Text>
                  <Text style={styles.detailValue}>
                    {snapshot.activeSnapshot?.schoolId ?? 'Not downloaded'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Snapshot</Text>
                  <Text style={styles.detailValue}>
                    {snapshot.activeSnapshot
                      ? shortUuid(snapshot.activeSnapshot.snapshotUuid)
                      : 'None'}
                  </Text>
                </View>
                <View style={[styles.detailRow, styles.lastDetailRow]}>
                  <Text style={styles.detailLabel}>Committed</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(snapshot.activeSnapshot?.committedAt)}
                  </Text>
                </View>
              </View>

              <SectionHeader title="Downloaded Data" />
              <View style={styles.metricsGrid}>
                <Metric value={snapshot.counts.classes} label="Classes" />
                <Metric value={snapshot.counts.students} label="Students" />
                <Metric
                  value={snapshot.counts.testAssignments}
                  label="Assessments"
                />
                <Metric value={snapshot.counts.questions} label="Questions" />
                <Metric value={snapshot.counts.answerSheets} label="Sheets" />
                <Metric
                  value={snapshot.counts.readyManifests}
                  label="Manifests"
                />
              </View>

              <SectionHeader title="Classes" />
              <View style={styles.sectionBand}>
                {snapshot.classes.length ? (
                  snapshot.classes.map((classItem, index) => (
                    <View
                      key={classItem.classAssignmentId}
                      style={[
                        styles.listRow,
                        index === snapshot.classes.length - 1 &&
                          styles.lastListRow,
                      ]}
                    >
                      <View style={styles.listIcon}>
                        <School size={18} color="#256B3A" strokeWidth={2.3} />
                      </View>
                      <View style={styles.listCopy}>
                        <Text style={styles.listTitle}>
                          {classItem.className}
                        </Text>
                        <Text style={styles.listMeta}>
                          {classItem.subjectName}
                        </Text>
                      </View>
                      <View style={styles.listNumbers}>
                        <Text style={styles.listNumber}>
                          {classItem.studentCount}
                        </Text>
                        <Text style={styles.listNumberLabel}>students</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>
                    No active snapshot classes.
                  </Text>
                )}
              </View>

              <SectionHeader title="Assessments" />
              <View style={styles.sectionBand}>
                {snapshot.assessments.length ? (
                  snapshot.assessments.map((assessment, index) => (
                    <View
                      key={assessment.testAssignmentId}
                      style={[
                        styles.assessmentRow,
                        index === snapshot.assessments.length - 1 &&
                          styles.lastListRow,
                      ]}
                    >
                      <View style={styles.assessmentTopRow}>
                        <Text style={styles.listTitle}>
                          {assessment.testName}
                        </Text>
                        <Text
                          style={[
                            styles.statusText,
                            assessment.captureAvailability === 'open'
                              ? styles.statusOpen
                              : styles.statusNeutral,
                          ]}
                        >
                          {assessment.captureAvailability.replaceAll('_', ' ')}
                        </Text>
                      </View>
                      <Text style={styles.listMeta}>
                        {assessment.className} | {assessment.subjectName}
                      </Text>
                      <Text style={styles.assessmentMeta}>
                        {assessment.termName} | {assessment.totalItems} items |{' '}
                        {assessment.answerSheetCount} sheet
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>
                    No active snapshot assessments.
                  </Text>
                )}
              </View>

              <SectionHeader title="Answer Sheets" />
              <View style={styles.sectionBand}>
                {snapshot.answerSheets.length ? (
                  snapshot.answerSheets.map((sheet, index) => (
                    <View
                      key={sheet.answerSheetUuid}
                      style={[
                        styles.sheetRow,
                        index === snapshot.answerSheets.length - 1 &&
                          styles.lastListRow,
                      ]}
                    >
                      <View style={styles.sheetIcon}>
                        <FileCheck2
                          size={19}
                          color={sheet.manifestReady ? '#16863A' : '#B45309'}
                          strokeWidth={2.4}
                        />
                      </View>
                      <View style={styles.listCopy}>
                        <Text style={styles.listTitle}>{sheet.testName}</Text>
                        <Text style={styles.listMeta}>
                          {sheet.paperSize} | {sheet.downloadedPages}/
                          {sheet.totalPages} pages | {sheet.downloadedRegions}/
                          {sheet.totalQuestions} regions
                        </Text>
                      </View>
                      <Text
                        style={
                          sheet.manifestReady
                            ? styles.manifestReady
                            : styles.manifestPending
                        }
                      >
                        {sheet.manifestReady ? 'Ready' : 'Missing'}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>
                    No answer-sheet identities.
                  </Text>
                )}
              </View>

              {snapshot.issues.length ? (
                <>
                  <SectionHeader title="Attention" />
                  <View style={styles.issueBand}>
                    {snapshot.issues.map(issue => (
                      <View key={issue} style={styles.issueRow}>
                        <AlertCircle
                          size={16}
                          color="#B45309"
                          strokeWidth={2.4}
                        />
                        <Text style={styles.issueText}>{issue}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.referenceFooter}>
                <Users size={15} color="#64748B" strokeWidth={2.2} />
                <Text style={styles.referenceText}>
                  Reference data:{' '}
                  {snapshot.referenceData
                    ? formatDate(snapshot.referenceData.refreshedAt)
                    : 'not downloaded'}
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    minHeight: 68,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE3E8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, paddingHorizontal: 8 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#17261B' },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7785',
  },
  scroll: { flex: 1 },
  content: { paddingVertical: 18, paddingBottom: 36 },
  connectionBand: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DCE3E8',
    gap: 9,
  },
  connectionLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: '#43515C',
  },
  connectionInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBD5DC',
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    color: '#17261B',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryConnectionButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#20B94B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryConnectionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  secondaryConnectionButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBD5DC',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryConnectionText: {
    color: '#43515C',
    fontSize: 11,
    fontWeight: '900',
  },
  connectionHint: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    color: '#6B7785',
  },
  connectedRow: { flexDirection: 'row', alignItems: 'center' },
  connectedIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#EDF8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mfaIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#FFF7E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  connectionTitle: { fontSize: 13, fontWeight: '900', color: '#17261B' },
  connectionMeta: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  connectionActions: { flexDirection: 'row', gap: 8 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodButton: {
    minHeight: 38,
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5DC',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodButtonActive: { borderColor: '#20B94B', backgroundColor: '#EDF8F0' },
  methodText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  methodTextActive: { color: '#16863A' },
  successBand: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#EDF8F0',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#B8D8C1',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  successText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: '#256B3A',
  },
  loadingState: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  statusBand: {
    minHeight: 78,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DCE3E8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandCopy: { flex: 1, marginLeft: 12 },
  statusTitle: { fontSize: 15, fontWeight: '900', color: '#17261B' },
  statusMeta: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  errorBand: {
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF4F2',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0B9B2',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  errorTitle: { fontSize: 13, fontWeight: '900', color: '#8A1C13' },
  errorText: { marginTop: 3, fontSize: 12, lineHeight: 17, color: '#9F2D23' },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 20,
    fontSize: 13,
    fontWeight: '900',
    color: '#17261B',
  },
  sectionBand: {
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DCE3E8',
  },
  detailRow: {
    minHeight: 43,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F3',
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastDetailRow: { borderBottomWidth: 0 },
  detailLabel: { width: 88, fontSize: 11, fontWeight: '800', color: '#64748B' },
  detailValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#26332A',
    textAlign: 'right',
  },
  metricsGrid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    width: '31.7%',
    minHeight: 75,
    borderWidth: 1,
    borderColor: '#DCE3E8',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: { fontSize: 20, fontWeight: '900', color: '#16863A' },
  metricLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  listRow: {
    minHeight: 66,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F3',
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastListRow: { borderBottomWidth: 0 },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#EDF8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  listTitle: { fontSize: 13, fontWeight: '900', color: '#17261B' },
  listMeta: { marginTop: 3, fontSize: 11, fontWeight: '600', color: '#64748B' },
  listNumbers: { width: 54, alignItems: 'flex-end' },
  listNumber: { fontSize: 15, fontWeight: '900', color: '#26332A' },
  listNumberLabel: { fontSize: 9, fontWeight: '700', color: '#7A8793' },
  assessmentRow: {
    minHeight: 84,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F3',
  },
  assessmentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: {
    marginLeft: 'auto',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusOpen: { color: '#16863A' },
  statusNeutral: { color: '#64748B' },
  assessmentMeta: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '700',
    color: '#7A8793',
  },
  sheetRow: {
    minHeight: 70,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F3',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manifestReady: { fontSize: 10, fontWeight: '900', color: '#16863A' },
  manifestPending: { fontSize: 10, fontWeight: '900', color: '#B45309' },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 12,
    color: '#7A8793',
  },
  issueBand: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFF9ED',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E8C98A',
    gap: 9,
  },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  issueText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#7A4B08',
  },
  referenceFooter: {
    marginTop: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  referenceText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
});
