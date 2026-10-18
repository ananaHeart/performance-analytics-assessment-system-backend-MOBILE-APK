import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Animated, StyleSheet, View, Text, StatusBar, TouchableOpacity, BackHandler, TextInput, ScrollView, Modal, Linking
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Mail,
  RefreshCw,
  Save,
  ScanLine,
  School,
  ShieldCheck,
  UserCircle,
  X,
} from 'lucide-react-native';

// 1. DATABASE IMPORTS
import {
  initDatabase, seedDemoData,
  getClassesByTeacher, getTestsByClass, getRosterForTest,
  getClassStats, resetAllScores, clearLocalTestingData, downloadSyncData, uploadAllUnsyncedResults, uploadUnsyncedResults,
  getLocalDataCounts, getRosterDebugInfo, getSelectedTestSyncStatus, collectUnsyncedResults,
  getAssessmentAnalytics, getClassLastSyncedMap, setClassLastSyncedAt,
} from './src/database/db';
import { loginTeacher, loginV2Teacher, type LoginResponse } from './src/services/authService';
import { V3_DIRECT_LOGIN } from './src/config/api';
import { downloadV2SyncData, uploadV2UnsyncedResults } from './src/services/v2SyncService';

// 2. COMPONENT IMPORTS
import { LoginScreen } from './src/components/LoginScreen';
import { LoginLoading } from './src/components/LoginLoading';
import { ClassList, TestList } from './src/components/NavigationLists';
import { CheckingGrid } from './src/components/CheckingGrid';
import { AnalyticsView } from './src/components/AnalyticsView';
import { OmrScannerModal } from './src/components/OmrScannerModal';
import { V3ObjectiveWorkflowModal } from './src/components/V3ObjectiveWorkflowModal';
import { DynamicOmrScannerPrototype } from './src/prototypes/v3DynamicOmrScanner/DynamicOmrScannerPrototype';
import { V3LoginFlow } from './src/components/V3LoginFlow';
import { V3ServerWakingNotice } from './src/components/V3ServerWakingNotice';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  DialogProvider,
  EmptyState,
  ListRow,
  ScreenHeader,
  TabBar,
  TabHeader,
  ToastProvider,
  useDialog,
  useToast,
  type TabBarItem,
} from './src/components/ui';
import { theme } from './src/theme/tokens';
import {
  APP_CREDIT,
  APP_DISPLAY_NAME,
  APP_VERSION,
  CONTACT_URL,
  PRIVACY_NOTICE_URL,
  USER_GUIDE_URL,
} from './src/config/appInfo';
import { V3MobileNetworkError } from './src/services/v3/mobileReadClient';
import { V3AuthNetworkError } from './src/services/v3/authClient';
import { initV2Database } from './src/database/v2/database';
import {
  getV2ClassesByTeacher,
  getV2RosterForTest,
  getV2TestSyncStatus,
  getV2TestsByClass,
} from './src/database/v2/contextRepository';
import { getV2AssessmentAnalytics } from './src/database/v2/analyticsRepository';
import { getLatestV2SyncByAssignment } from './src/database/v2/syncRepository';
import { initV3Database } from './src/database/v3/database';
import {
  getV3OfflineDiagnosticSnapshot,
  type V3OfflineDiagnosticSnapshot,
} from './src/database/v3/diagnosticRepository';
import { getV3ObjectiveStudents } from './src/database/v3/objectiveRepository';
import { normalizeV3BaseUrl, type V3AuthSession } from './src/services/v3/authClient';
import {
  defaultV3DiagnosticsConnection,
  V3_BASE_URL,
} from './src/services/v3/diagnosticsConnection';
import { V3SessionReauthenticationError } from './src/services/v3/secureSessionService';

const ENABLE_DEMO_SEED = false;

const mapV3Classes = (snapshot: V3OfflineDiagnosticSnapshot): any[] =>
  snapshot.classes.map(classItem => ({
    class_id: classItem.classId,
    class_assignment_id: classItem.classAssignmentId,
    grade_level_name: classItem.gradeLevelName,
    section_name: classItem.sectionName,
    subject_name: classItem.subjectName,
    student_count: classItem.studentCount,
    assessment_count: classItem.assessmentCount,
    assignment_status: classItem.assignmentStatus,
    storage_version: 'v3',
  }));

const mapV3Assessments = (
  snapshot: V3OfflineDiagnosticSnapshot,
  classAssignmentId: number,
): any[] => snapshot.assessments
  .filter(assessment => assessment.classAssignmentId === classAssignmentId)
  .map(assessment => ({
    test_id: assessment.testId,
    test_assignment_id: assessment.testAssignmentId,
    class_id: assessment.classId,
    class_assignment_id: assessment.classAssignmentId,
    assignment_uuid: assessment.assignmentUuid,
    test_name: assessment.testName,
    subject_name: assessment.subjectName,
    term_name: assessment.termName,
    assignment_status: assessment.assignmentStatus,
    capture_availability: assessment.captureAvailability,
    test_date: assessment.closeAt,
    total_items: assessment.totalItems,
    answer_sheet_count: assessment.answerSheetCount,
    storage_version: 'v3',
  }));

type RefreshSource = 'button' | 'pull';
type MainTab = 'CLASSES' | 'ANALYTICS' | 'PROFILE';

const MAIN_TABS: TabBarItem<MainTab>[] = [
  { key: 'CLASSES', label: 'Classes', icon: School },
  { key: 'ANALYTICS', label: 'Synchronization', icon: RefreshCw },
  { key: 'PROFILE', label: 'Profile', icon: UserCircle },
];

// A request that never reached the server (no signal, airplane mode), as
// opposed to the server answering with an error.
const isNetworkFailure = (error: unknown): boolean =>
  (error instanceof V3MobileNetworkError && error.code === 'NETWORK_UNAVAILABLE')
  || error instanceof V3AuthNetworkError
  || (error instanceof TypeError && /network request failed/i.test(error.message));

// Synced / Unsynced / No Records for a V3 class, from the results saved on
// this phone: anything saved but not yet sent makes the class "Unsynced".
const v3ClassStatusLabel = (snapshot: V3OfflineDiagnosticSnapshot, classItem: any): string => {
  let hasOfficial = false;
  for (const assessment of snapshot.assessments) {
    if (assessment.classAssignmentId !== classItem.class_assignment_id) continue;
    const students = getV3ObjectiveStudents(assessment.testAssignmentId, classItem.class_id);
    if (students.some(student => student.operationStage !== null && student.officialScore === null)) {
      return 'Unsynced';
    }
    hasOfficial = hasOfficial || students.some(student => student.officialScore !== null);
  }
  return hasOfficial ? 'Synced' : 'No Records';
};

const AppContent = (): React.JSX.Element => {
  type AuthenticatedTeacher = LoginResponse;
  const dialog = useDialog();
  const showToast = useToast();
  type AssessmentAnalyticsState = {
    competencyPerformance: any[];
    itemAnalysis: any[];
  };

  const [view, setView] = useState<'LOGIN' | 'CLASSES' | 'TESTS' | 'CHECKING'>('LOGIN');
  const [activeTab, setActiveTab] = useState<MainTab>('CLASSES');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInProgressRef = useRef(false);
  // Set when a download fails for lack of a connection; cleared by the next one that works.
  const [isOffline, setIsOffline] = useState(false);
  // While a saved login is being restored at startup, show the loading screen
  // instead of flashing the login form for a moment before Classes appears.
  const [isRestoringSession, setIsRestoringSession] = useState(__DEV__ || V3_DIRECT_LOGIN);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [teacher, setTeacher] = useState<AuthenticatedTeacher | null>(null);
  const [v1SessionAvailable, setV1SessionAvailable] = useState(false);
  const [v2AccessToken, setV2AccessToken] = useState<string | null>(null);
  const [v3Session, setV3Session] = useState<V3AuthSession | null>(null);
  const [v3Snapshot, setV3Snapshot] = useState<V3OfflineDiagnosticSnapshot | null>(null);
  const activeTeacherId = teacher?.userId ?? null;

  // Selection States
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [isStudentSearchFocused, setIsStudentSearchFocused] = useState(false);
  const [isStudentListOpen, setIsStudentListOpen] = useState(false);
  const [isOmrScannerOpen, setIsOmrScannerOpen] = useState(false);
  const [isDynamicOmrTestOpen, setIsDynamicOmrTestOpen] = useState(false);
  const [isV3ObjectiveOpen, setIsV3ObjectiveOpen] = useState(false);
  const [v3InitialLoginRequest, setV3InitialLoginRequest] = useState<{
    requestId: number;
    email: string;
    password: string;
  } | null>(null);
  // Bumped to remount (and so empty) the login form after a rejected account.
  const [loginFormKey, setLoginFormKey] = useState(0);
  const [omrScannerMode, setOmrScannerMode] = useState<'scan' | 'view'>('scan');
  const [saveFeedback, setSaveFeedback] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [profileMode, setProfileMode] = useState<'PROFILE' | 'SYNC'>('PROFILE');

  // Data States
  const [classes, setClasses] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [stats, setStats] = useState({ average: 0, gradedCount: 0, topStudent: 'N/A' });
  const [analyticsData, setAnalyticsData] = useState<AssessmentAnalyticsState>({ competencyPerformance: [], itemAnalysis: [] });
  const [localCounts, setLocalCounts] = useState({ classes: 0, students: 0, tests: 0, testParts: 0 });
  const [, setPendingSyncSummary] = useState({ results: 0, items: 0 });
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [activeUploadKey, setActiveUploadKey] = useState<string | null>(null);
  const [syncStatusBanner, setSyncStatusBanner] = useState<{
    tone: 'success' | 'error' | 'partial' | 'info';
    message: string;
  } | null>(null);
  const [selectedTestStatus, setSelectedTestStatus] = useState<{
    totalStudents: number;
    checkedStudents: number;
    syncedStudents: number;
    unsyncedStudents: number;
    uncheckedStudents: number;
  } | null>(null);
  const checkingGridRef = useRef<{ saveAllResponses: () => { savedCount: number; score: number } } | null>(null);
  const uploadInProgressRef = useRef(false);
  const saveFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const [rosterDebug, setRosterDebug] = useState<{
    class_id: number;
    section_id: number | null;
    grade_level_id: number | null;
    academic_year_id: number | null;
    localStudentsFound: number;
    localEnrollmentsFound: number;
  } | null>(null);

  const refreshData = useCallback(() => {
    console.log('APP: Refreshing local SQLite-backed lists.');
    setDataVersion((value) => value + 1);
  }, []);

  const handleV3Authenticated = useCallback((
    session: V3AuthSession,
    snapshot: V3OfflineDiagnosticSnapshot,
  ) => {
    setV1SessionAvailable(false);
    setV2AccessToken(null);
    setV3Session(session);
    setV3Snapshot(snapshot);
    setTeacher({
      userId: session.user.userId,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      email: session.user.email,
      role: session.user.role,
      status: session.user.status,
      token: session.accessToken,
    });
    setSelectedClass(null);
    setSelectedTest(null);
    setSelectedStudent(null);
    setRoster([]);
    setLastSyncAt(snapshot.activeSnapshot
      ? new Date(snapshot.activeSnapshot.committedAt).getTime()
      : null);
    setSyncStatusBanner(null);
    setIsLoggedIn(true);
    setActiveTab('CLASSES');
    setView('CLASSES');
    setProfileMode('PROFILE');
    setV3InitialLoginRequest(null);
  }, []);

  const formatLastSync = (timestamp: number | string | null) => {
    if (timestamp == null || timestamp === '') {
      return 'Not synced yet';
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return 'Not synced yet';
    }

    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const refreshLocalSummaries = useCallback(() => {
    initDatabase();
    setLocalCounts(getLocalDataCounts());

    const unsyncedResults = collectUnsyncedResults(activeTeacherId);
    if (!unsyncedResults?.success) {
      setPendingSyncSummary({ results: 0, items: 0 });
      return;
    }

    setPendingSyncSummary({
      results: unsyncedResults.payload?.test_results?.length ?? 0,
      items: unsyncedResults.payload?.item_responses?.length ?? 0,
    });
  }, [activeTeacherId]);

  const showSaveFeedback = useCallback((message: string) => {
    if (saveFeedbackTimeoutRef.current) {
      clearTimeout(saveFeedbackTimeoutRef.current);
    }

    saveFeedbackOpacity.stopAnimation();
    saveFeedbackOpacity.setValue(1);
    setSaveFeedback(message);
    saveFeedbackTimeoutRef.current = setTimeout(() => {
      Animated.timing(saveFeedbackOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(({finished}) => {
        if (finished) setSaveFeedback('');
        saveFeedbackTimeoutRef.current = null;
      });
    }, 1500);
  }, [saveFeedbackOpacity]);

  useEffect(() => {
    refreshLocalSummaries();

    if (activeTeacherId == null) {
      setClasses([]);
      return;
    }

    if (v1SessionAvailable) {
      setClasses(getClassesByTeacher(activeTeacherId));
    } else if (v2AccessToken) {
      setClasses(getV2ClassesByTeacher(activeTeacherId));
    } else if (v3Session && v3Snapshot) {
      setClasses(mapV3Classes(v3Snapshot));
    } else {
      setClasses([]);
    }
  }, [activeTeacherId, dataVersion, refreshLocalSummaries, v1SessionAvailable, v2AccessToken, v3Session, v3Snapshot]);

  useEffect(() => {
    initV2Database().catch(error => {
      console.error('V2 SQLite initialization failed:', error);
    });
  }, []);

  useEffect(() => {
    if (!__DEV__ && !V3_DIRECT_LOGIN) return;
    let active = true;

    defaultV3DiagnosticsConnection.restore()
      .then(async result => {
        if (!active || result.kind !== 'restored') return;
        // A session saved against another backend (e.g. the laptop, before
        // switching to the cloud build) is not valid here; sign in again.
        if (result.backendUrl !== normalizeV3BaseUrl(V3_BASE_URL)) return;
        await initV3Database();
        const snapshot = getV3OfflineDiagnosticSnapshot(undefined, result.session.user.userId);
        if (!active || !snapshot.activeSnapshot) return;
        handleV3Authenticated(result.session, snapshot);
      })
      .catch(error => {
        console.log('V3 AUTH: Startup session restoration was unavailable.', error);
      })
      .finally(() => {
        if (active) setIsRestoringSession(false);
      });

    return () => {
      active = false;
    };
  }, [handleV3Authenticated]);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimeoutRef.current) {
        clearTimeout(saveFeedbackTimeoutRef.current);
      }
      saveFeedbackOpacity.stopAnimation();
    };
  }, [saveFeedbackOpacity]);

  useEffect(() => {
    if (!selectedClass?.class_id) {
      setTests([]);
      return;
    }

    if (selectedClass.storage_version === 'v2') {
      setTests(getV2TestsByClass(selectedClass.class_id, selectedClass.class_assignment_id));
    } else if (selectedClass.storage_version === 'v3' && v3Snapshot) {
      setTests(mapV3Assessments(v3Snapshot, selectedClass.class_assignment_id));
    } else {
      setTests(getTestsByClass(selectedClass.class_id));
    }
  }, [selectedClass?.class_assignment_id, selectedClass?.class_id, selectedClass?.storage_version, dataVersion, v3Snapshot]);

  useEffect(() => {
    if (!selectedTest?.test_id) {
      setRoster([]);
      setStats({ average: 0, gradedCount: 0, topStudent: 'N/A' });
      setAnalyticsData({ competencyPerformance: [], itemAnalysis: [] });
      setSelectedTestStatus(null);
      setRosterDebug(null);
      return;
    }

    console.log('APP: Reloading roster and test stats from SQLite.');
    const resolvedClassId = selectedClass?.class_id ?? selectedTest.class_id;
    if (selectedTest.storage_version === 'v3') {
      setRoster([]);
      setStats({ average: 0, gradedCount: 0, topStudent: 'N/A' });
      setAnalyticsData({ competencyPerformance: [], itemAnalysis: [] });
      setSelectedTestStatus(null);
      setRosterDebug(null);
      return;
    }
    if (selectedTest.storage_version === 'v2') {
      const updatedRoster = getV2RosterForTest(selectedTest.test_id, resolvedClassId);
      const checkedStudents = updatedRoster.filter(student => Number(student.is_checked) === 1);
      const totalScore = checkedStudents.reduce((sum, student) => sum + Number(student.score || 0), 0);
      setRoster(updatedRoster);
      setStats({
        average: checkedStudents.length > 0 ? totalScore / checkedStudents.length : 0,
        gradedCount: checkedStudents.length,
        topStudent: checkedStudents.length > 0 ? checkedStudents[0].first_name : 'N/A',
      });
      setAnalyticsData(getV2AssessmentAnalytics(selectedTest.test_id, resolvedClassId));
      setSelectedTestStatus(getV2TestSyncStatus(selectedTest.test_id, resolvedClassId));
      setRosterDebug(null);
      return;
    }

    const updatedRoster = getRosterForTest(
      selectedTest.test_id,
      resolvedClassId,
    );
    const updatedStats = getClassStats(selectedTest.test_id);
    const updatedStatus = getSelectedTestSyncStatus(selectedTest.test_id, resolvedClassId);
    const updatedAnalytics = getAssessmentAnalytics(selectedTest.test_id, resolvedClassId);
    const debugInfo = getRosterDebugInfo(resolvedClassId);
    setRoster(updatedRoster);
    setStats(updatedStats);
    setAnalyticsData(updatedAnalytics);
    setSelectedTestStatus(updatedStatus);
    setRosterDebug(debugInfo);
  }, [selectedClass?.class_id, selectedTest?.class_id, selectedTest?.storage_version, selectedTest?.test_id, dataVersion]);

  useEffect(() => {
    if (view !== 'CHECKING') {
      return;
    }

    if (roster.length === 0) {
      if (selectedStudent !== null) {
        setSelectedStudent(null);
      }
      return;
    }

    const currentStudent = selectedStudent
      ? roster.find((student: any) => student.student_id === selectedStudent.student_id)
      : null;

    if (!currentStudent) {
      setSelectedStudent(roster[0]);
      return;
    }

    if (currentStudent !== selectedStudent) {
      setSelectedStudent(currentStudent);
    }
  }, [roster, selectedStudent, view]);

  // 3. INITIALIZATION & BACK BUTTON
  useEffect(() => {
    initDatabase();
    if (ENABLE_DEMO_SEED) {
      console.log('Demo seed enabled. Standalone demo testing mode.');
      seedDemoData();
    } else {
      console.log('Demo seed disabled. Backend-connected testing mode.');
    }

    const onBackPress = () => {
      if (isLoggedIn && activeTab !== 'CLASSES') {
        setActiveTab('CLASSES');
        return true;
      }

      if (view === 'CHECKING') {
        setView('TESTS');
        return true;
      }
      if (view === 'TESTS') {
        setView('CLASSES');
        return true;
      }
      if (view === 'CLASSES' && isLoggedIn) { return true; }
      if (view === 'CLASSES') { setView('LOGIN'); return true; }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [activeTab, isLoggedIn, view, refreshData]);

  const handleReset = () => {
  dialog.confirm({
    title: "Reset All Data?",
    message: "This will delete all student scores for this demo. Are you sure?",
    confirmLabel: "Yes, Reset",
    destructive: true,
    onConfirm: () => {
      resetAllScores();
      refreshData(); // I-refresh ang UI agad para mag-zero ang scores
      dialog.info({ title: "Success", message: "All scores have been wiped." });
    },
  });
};


  // 4. NAVIGATION HANDLERS
  const handleLogin = async (email: string, password: string) => {
    // Local-release and cloud builds use V3 directly, including its MFA challenge.
    // Avoid sending the same credentials to unrelated legacy login endpoints.
    if (V3_DIRECT_LOGIN) {
      setV3InitialLoginRequest({ requestId: Date.now(), email, password });
      return;
    }

    try {
      type AccessIssue = {title: string; message: string};
      const getAccessIssue = (account: {role: string; status: string}): AccessIssue | null => {
        const role = account.role?.toLowerCase?.() || '';
        const status = account.status?.toLowerCase?.() || '';

        if (role === 'principal') {
          return {title: 'Teacher Access Only', message: 'This mobile app is for teacher accounts only.'};
        }
        if (role !== 'teacher') {
          return {title: 'Login Error', message: 'Only teacher accounts can use this mobile app.'};
        }
        if (status === 'pending') {
          return {title: 'Account Pending', message: 'Your teacher account is still pending approval.'};
        }
        if (status === 'rejected') {
          return {title: 'Account Rejected', message: 'Your teacher account has been rejected.'};
        }
        if (status !== 'active') {
          return {title: 'Login Error', message: `Teacher account status is ${account.status}.`};
        }
        return null;
      };

      let v1Teacher: LoginResponse | null = null;
      let v2Teacher: LoginResponse | null = null;
      let nextV2AccessToken: string | null = null;
      let accessIssue: AccessIssue | null = null;
      let v1LoginError: unknown = null;
      let v2LoginError: unknown = null;

      try {
        const candidate = await loginTeacher({email, password});
        const issue = getAccessIssue(candidate);
        if (issue) {
          accessIssue = issue;
        } else {
          v1Teacher = candidate;
        }
      } catch (error) {
        v1LoginError = error;
        console.log('V1 AUTH: Session unavailable; checking V2.', error);
      }

      try {
        const v2Session = await loginV2Teacher({email, password});
        const issue = getAccessIssue(v2Session.user);
        if (issue) {
          accessIssue = accessIssue || issue;
        } else {
          nextV2AccessToken = v2Session.accessToken;
          v2Teacher = {
            userId: v2Session.user.userId,
            firstName: v2Session.user.firstName,
            lastName: v2Session.user.lastName,
            email: v2Session.user.email,
            role: v2Session.user.role,
            status: v2Session.user.status,
            token: v2Session.accessToken,
          };
        }
      } catch (error) {
        v2LoginError = error;
        console.log('V2 AUTH: Session unavailable; checking V1.', error);
      }

      const authenticatedTeacher = v1Teacher || v2Teacher;
      if (!authenticatedTeacher) {
        if (accessIssue) {
          dialog.info({ title: accessIssue.title, message: accessIssue.message });
          return;
        }

        if (__DEV__) {
          setV3InitialLoginRequest({
            requestId: Date.now(),
            email,
            password,
          });
          return;
        }

        const errors = [v1LoginError, v2LoginError]
          .map(error => error instanceof Error ? error.message : null)
          .filter((message): message is string => Boolean(message));
        throw new Error([...new Set(errors)].join(' ') || 'Unable to log in with the backend.');
      }

      setV1SessionAvailable(Boolean(v1Teacher));
      setV2AccessToken(nextV2AccessToken);
      setV3Session(null);
      setV3Snapshot(null);
      setTeacher(authenticatedTeacher);
      setLastSyncAt(null);
      setSyncStatusBanner(null);
      console.log('AUTH: Connected as userId:', authenticatedTeacher.userId);
      setIsLoggedIn(true);
      setActiveTab('CLASSES');
      setView('CLASSES');

      // Development fallback only. Do not use in the normal mobile login flow.
      // const localDemoUser = loginUser('admin', '1234');
      // if (localDemoUser) { ... }
    } catch (error) {
      console.error('Backend login failed:', error);
      const message = error instanceof Error ? error.message : 'Unable to log in with the backend.';
      dialog.info({ title: 'Login Error', message });
    }
  };

  const handleSelectClass = (cls: any) => {
    setSelectedClass(cls);
    setView('TESTS');
  };

  const handleSelectAnalyticsClass = (cls: any) => {
    setSelectedClass(cls);
    setSelectedTest(null);
    setSelectedStudent(null);
    setSelectedTestStatus(null);
    setRoster([]);
    setStats({ average: 0, gradedCount: 0, topStudent: 'N/A' });
    setAnalyticsData({ competencyPerformance: [], itemAnalysis: [] });
    setRosterDebug(null);
    setStudentSearch('');
  };

  const handleSelectTest = (tst: any) => {
    if (tst.storage_version === 'v3') {
      setSelectedTest(tst);
      setIsV3ObjectiveOpen(true);
      return;
    }
    setSelectedTest(tst);
    setStudentSearch('');
    const resolvedClassId = tst.class_id ?? selectedClass?.class_id;
    if (tst.storage_version === 'v2') {
      const students = getV2RosterForTest(tst.test_id, resolvedClassId);
      const checkedStudents = students.filter(student => Number(student.is_checked) === 1);
      const totalScore = checkedStudents.reduce((sum, student) => sum + Number(student.score || 0), 0);
      setRoster(students);
      setStats({
        average: checkedStudents.length > 0 ? totalScore / checkedStudents.length : 0,
        gradedCount: checkedStudents.length,
        topStudent: checkedStudents.length > 0 ? checkedStudents[0].first_name : 'N/A',
      });
      setAnalyticsData(getV2AssessmentAnalytics(tst.test_id, resolvedClassId));
      setSelectedTestStatus(getV2TestSyncStatus(tst.test_id, resolvedClassId));
      setRosterDebug(null);
      setSelectedStudent(students.length > 0 ? students[0] : null);
      setView('CHECKING');
      return;
    }

    const students = getRosterForTest(tst.test_id, resolvedClassId);
    const statistics = getClassStats(tst.test_id);
    const status = resolvedClassId != null ? getSelectedTestSyncStatus(tst.test_id, resolvedClassId) : null;
    const computedAnalytics = resolvedClassId != null ? getAssessmentAnalytics(tst.test_id, resolvedClassId) : { competencyPerformance: [], itemAnalysis: [] };
    const debugInfo = resolvedClassId != null ? getRosterDebugInfo(resolvedClassId) : null;
    setRoster(students);
    setStats(statistics);
    setAnalyticsData(computedAnalytics);
    setSelectedTestStatus(status);
    setRosterDebug(debugInfo);
    setSelectedStudent(students.length > 0 ? students[0] : null);
    setView('CHECKING');
  };

  const handleSelectAnalyticsAssessment = async (tst: any) => {
    setSelectedTest(tst);
    setStudentSearch('');
    const resolvedClassId = tst.class_id ?? selectedClass?.class_id;
    if (tst.storage_version === 'v3') {
      // Analytics is a read-only summary - selecting an assessment here must
      // never open V3ObjectiveWorkflowModal (that's the scan/check flow,
      // reached only from the Classes tab's assessment cards).
      await initV3Database();
      const v3Students = resolvedClassId != null ? getV3ObjectiveStudents(tst.test_assignment_id, resolvedClassId) : [];
      const scoredStudents = v3Students.filter(student => student.officialScore !== null);
      const totalScore = scoredStudents.reduce((sum, student) => sum + (student.officialScore?.totalScore ?? 0), 0);
      const mappedRoster = v3Students.map(student => ({
        student_id: student.studentId,
        first_name: student.firstName,
        last_name: student.lastName,
        is_checked: student.officialScore ? 1 : 0,
        score: student.officialScore?.totalScore ?? 0,
        maxScore: student.officialScore?.maxScore ?? 0,
      }));
      setRoster(mappedRoster);
      setStats({
        average: scoredStudents.length > 0 ? totalScore / scoredStudents.length : 0,
        gradedCount: scoredStudents.length,
        topStudent: scoredStudents.length > 0 ? scoredStudents[0].firstName : 'N/A',
      });
      // No V3 competency/item-analysis rollup exists yet - the charts render
      // their own "no data yet" empty state until that's built.
      setAnalyticsData({ competencyPerformance: [], itemAnalysis: [] });
      const checkedCount = v3Students.filter(student => student.operationStage !== null || student.officialScore !== null).length;
      setSelectedTestStatus({
        totalStudents: v3Students.length,
        checkedStudents: checkedCount,
        syncedStudents: scoredStudents.length,
        unsyncedStudents: v3Students.filter(student => student.operationStage !== null && student.officialScore === null).length,
        uncheckedStudents: v3Students.length - checkedCount,
      });
      setRosterDebug(null);
      setSelectedStudent(mappedRoster.length > 0 ? mappedRoster[0] : null);
      return;
    }
    if (tst.storage_version === 'v2') {
      const students = getV2RosterForTest(tst.test_id, resolvedClassId);
      const checkedStudents = students.filter(student => Number(student.is_checked) === 1);
      const totalScore = checkedStudents.reduce((sum, student) => sum + Number(student.score || 0), 0);
      setRoster(students);
      setStats({
        average: checkedStudents.length > 0 ? totalScore / checkedStudents.length : 0,
        gradedCount: checkedStudents.length,
        topStudent: checkedStudents.length > 0 ? checkedStudents[0].first_name : 'N/A',
      });
      setAnalyticsData(getV2AssessmentAnalytics(tst.test_id, resolvedClassId));
      setSelectedTestStatus(getV2TestSyncStatus(tst.test_id, resolvedClassId));
      setRosterDebug(null);
      setSelectedStudent(students.length > 0 ? students[0] : null);
      return;
    }

    const students = getRosterForTest(tst.test_id, resolvedClassId);
    const statistics = getClassStats(tst.test_id);
    const status = resolvedClassId != null ? getSelectedTestSyncStatus(tst.test_id, resolvedClassId) : null;
    const computedAnalytics = resolvedClassId != null ? getAssessmentAnalytics(tst.test_id, resolvedClassId) : { competencyPerformance: [], itemAnalysis: [] };
    const debugInfo = resolvedClassId != null ? getRosterDebugInfo(resolvedClassId) : null;
    setRoster(students);
    setStats(statistics);
    setAnalyticsData(computedAnalytics);
    setSelectedTestStatus(status);
    setRosterDebug(debugInfo);
    setSelectedStudent(students.length > 0 ? students[0] : null);
  };

  const handleSelectStudent = (student: any) => {
    setSelectedStudent(student);
    setStudentSearch('');
    setIsStudentListOpen(false);
  };

  const handleGridScoreChange = useCallback(({
    studentId,
    score,
    maxScore,
  }: {
    studentId: number;
    score: number;
    maxScore: number;
  }) => {
    if (studentId == null) {
      return;
    }

    setSelectedStudent((current: any) => {
      if (!current || current.student_id !== studentId) {
        return current;
      }

      return { ...current, score, maxScore };
    });

    setRoster((currentRoster) =>
      currentRoster.map((student) =>
        student.student_id === studentId ? { ...student, score, maxScore } : student
      ),
    );
  }, []);

  const handleNextStudent = () => {
    const currentIndex = roster.findIndex(s => s.student_id === selectedStudent?.student_id);
    if (currentIndex >= 0 && currentIndex < roster.length - 1) {
      setSelectedStudent(roster[currentIndex + 1]);
      setStudentSearch('');
    }
  };

  const handlePrevStudent = () => {
    const currentIndex = roster.findIndex(s => s.student_id === selectedStudent?.student_id);
    if (currentIndex > 0) {
      setSelectedStudent(roster[currentIndex - 1]);
      setStudentSearch('');
    }
  };

  // A refresh started by pulling the list down reports back in a toast; the
  // refresh button and the uploads keep the "Sync Status" dialog.
  const showSyncStatusMessage = (message: string, source: RefreshSource = 'button') => {
    let tone: 'success' | 'error' | 'partial' | 'info' = 'info';
    if (message.startsWith('Download failed.') || message.startsWith('Upload failed.')) {
      tone = 'error';
    } else if (message.startsWith('Download partially successful.') || message.startsWith('Upload partially successful.')) {
      tone = 'partial';
    } else if (message.startsWith('Downloaded successfully.') || message.startsWith('Uploaded successfully.')) {
      tone = 'success';
    }

    setSyncStatusBanner({ tone, message });
    if (source === 'pull') {
      showToast(tone === 'error'
        ? { variant: 'error', message, onRetry: () => { handleDownloadSync('pull'); } }
        : { variant: 'notice', message });
      return;
    }
    dialog.info({ title: 'Sync Status', message });
  };

  const buildUploadStatusMessage = (summary: {
    uploadedResults?: number;
    uploadedItems?: number;
    duplicateResults?: number;
    duplicateItems?: number;
  }) => {
    const uploadedResults = summary.uploadedResults ?? 0;
    const uploadedItems = summary.uploadedItems ?? 0;
    const duplicateResults = summary.duplicateResults ?? 0;
    const duplicateItems = summary.duplicateItems ?? 0;
    const hasDuplicates = duplicateResults > 0 || duplicateItems > 0;
    const prefix = hasDuplicates ? 'Upload partially successful.' : 'Uploaded successfully.';

    return `${prefix} Results: ${uploadedResults}, items: ${uploadedItems}, duplicate results: ${duplicateResults}, duplicate items: ${duplicateItems}.`;
  };

  const beginUpload = (uploadKey: string) => {
    if (uploadInProgressRef.current) {
      setSyncStatusBanner({
        tone: 'info',
        message: 'An upload is already in progress. Please wait for it to finish.',
      });
      return false;
    }

    uploadInProgressRef.current = true;
    setActiveUploadKey(uploadKey);
    return true;
  };

  const endUpload = () => {
    uploadInProgressRef.current = false;
    setActiveUploadKey(null);
  };

  const uploadV2Tests = async (testItems: any[]) => {
    if (!v2AccessToken) {
      return {
        uploadedResults: 0,
        failedResults: 0,
        latestCompletedAt: null as string | null,
        errors: ['Your authenticated upload session is unavailable. Log in again.'],
      };
    }

    let uploadedResults = 0;
    let failedResults = 0;
    let latestCompletedAt: string | null = null;
    const errors: string[] = [];
    const uniqueTests = [...new Map(testItems.map(test => [test.test_id, test])).values()];

    for (const test of uniqueTests) {
      const result = await uploadV2UnsyncedResults(v2AccessToken, test.test_id);
      uploadedResults += result.uploadedResults;
      failedResults += result.failedResults;
      if (result.completedAt) {
        if (!latestCompletedAt || new Date(result.completedAt).getTime() > new Date(latestCompletedAt).getTime()) {
          latestCompletedAt = result.completedAt;
        }
      }
      if (!result.success && result.error) {
        errors.push(`${test.test_name || `Assessment ${test.test_id}`}: ${result.error}`);
      }
    }

    return {uploadedResults, failedResults, latestCompletedAt, errors};
  };

  const handleSaveCurrentStudent = () => {
    if (!selectedStudent || !selectedTest) {
      return;
    }

    const result = checkingGridRef.current?.saveAllResponses();
    refreshData();

    const resolvedClassId = selectedClass?.class_id ?? selectedTest.class_id;
    const updatedStatus = resolvedClassId != null
      ? getSelectedTestSyncStatus(selectedTest.test_id, resolvedClassId)
      : null;
    const checkedStudents = updatedStatus?.checkedStudents ?? 1;
    const totalStudents = updatedStatus?.totalStudents ?? roster.length;

    dialog.info({
      title: 'Checking Saved',
      message: `The current student's responses have been saved locally.\n\nChecked students: ${checkedStudents} of ${totalStudents}.\n\nYou may return to this assessment later to continue checking.`,
      onClose: () => {
        setSaveFeedback('');
        setSelectedTest(null);
        setSelectedStudent(null);
        setSelectedTestStatus(null);
        setRoster([]);
        setStudentSearch('');
        setView('TESTS');
      },
    });
  };

  const handleSaveAndNextStudent = () => {
    checkingGridRef.current?.saveAllResponses();
    refreshData();
    showSaveFeedback('Saved locally. Moving to next student.');
    handleNextStudent();
  };

  const handleFinishV2Checking = () => {
    setSaveFeedback('');
    setSelectedTest(null);
    setSelectedStudent(null);
    setSelectedTestStatus(null);
    setRoster([]);
    setStudentSearch('');
    setView('TESTS');
  };

  // The refresh button and pull-to-refresh on the Classes and assessment lists.
  const handleDownloadSync = async (source: RefreshSource = 'button') => {
    if (refreshInProgressRef.current) return;
    refreshInProgressRef.current = true;
    setIsRefreshing(true);
    const report = (message: string) => showSyncStatusMessage(message, source);
    try {
      if (activeTeacherId == null) {
        dialog.info({ title: 'Sync Error', message: 'Teacher account is not available. Please log in again.' });
        return;
      }

      if (v3Session) {
        try {
          const nextSnapshot = await defaultV3DiagnosticsConnection.refresh(
            V3_BASE_URL,
            v3Session,
          );
          setIsOffline(false);
          setV3Snapshot(nextSnapshot);
          setLastSyncAt(nextSnapshot.activeSnapshot
            ? new Date(nextSnapshot.activeSnapshot.committedAt).getTime()
            : Date.now());
          report(
            `V3 download complete. Classes: ${nextSnapshot.counts.classes}, students: ${nextSnapshot.counts.students}, assessments: ${nextSnapshot.counts.testAssignments}.`,
          );
        } catch (error) {
          if (error instanceof V3SessionReauthenticationError) {
            setIsLoggedIn(false);
            setTeacher(null);
            setV3Session(null);
            setSelectedClass(null);
            setSelectedTest(null);
            setView('LOGIN');
            dialog.info({
              title: 'Session Expired',
              message: 'Your V3 session expired or was rejected. Sign in again. Downloaded data remains on this phone.',
            });
            return;
          }
          if (isNetworkFailure(error)) {
            setIsOffline(true);
          }
          throw error;
        }
        return;
      }

      let v1Summary: string | null = null;
      let v1Warning: string | null = null;
      if (v1SessionAvailable) {
        try {
          const result = await downloadSyncData(activeTeacherId);
          if (result.success) {
            const summary = result.summary || {
              classes: 0,
              students: 0,
              tests: 0,
              testParts: 0,
              competencies: 0,
            };
            v1Summary = `V1 classes: ${summary.classes}, students: ${summary.students}, tests: ${summary.tests}, test parts: ${summary.testParts}, competencies: ${summary.competencies}.`;
          } else {
            v1Warning = result.error || 'Unable to download V1 assigned data.';
          }
        } catch (v1Error) {
          v1Warning = v1Error instanceof Error ? v1Error.message : 'Unable to download V1 assigned data.';
        }
      } else {
        v1Warning = 'V1 session is unavailable for this account.';
      }

      let v2Summary: string | null = null;
      let v2Warning: string | null = null;
      if (v2AccessToken) {
        try {
          const v2Result = await downloadV2SyncData(v2AccessToken);
          v2Summary = `V2 classes: ${v2Result.counts.classes}, students: ${v2Result.counts.students}, tests: ${v2Result.counts.tests}, questions: ${v2Result.counts.questions}.`;
        } catch (v2Error) {
          v2Warning = v2Error instanceof Error ? v2Error.message : 'Unable to download V2 offline context.';
        }
      } else {
        v2Warning = 'V2 session is unavailable. Log out and log in again after the V2 backend is available.';
      }

      refreshData();
      const summaries = [v1Summary, v2Summary].filter((summary): summary is string => Boolean(summary));
      const warnings = [
        v1Warning ? `V1: ${v1Warning}` : null,
        v2Warning ? `V2: ${v2Warning}` : null,
      ].filter((warning): warning is string => Boolean(warning));

      if (summaries.length === 0) {
        report(`Download failed. ${warnings.join(' ') || 'No backend download path is available.'}`);
      } else if (warnings.length > 0) {
        report(`Download partially successful. ${summaries.join(' ')} ${warnings.join(' ')}`);
      } else {
        report(`Downloaded successfully. ${summaries.join(' ')}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to download sync data.';
      report(`Download failed. ${message}`);
    } finally {
      refreshInProgressRef.current = false;
      setIsRefreshing(false);
    }
  };

  const handleUploadSync = async () => {
    let uploadStarted = false;
    try {
      if (activeTeacherId == null) {
        dialog.info({ title: 'Sync Error', message: 'Teacher account is not available. Please log in again.' });
        return;
      }

      if (selectedTest?.test_id == null) {
        dialog.info({ title: 'Select Test', message: 'Select a test first before uploading current results.' });
        return;
      }

      uploadStarted = beginUpload(`test:${selectedTest.test_id}`);
      if (!uploadStarted) {
        return;
      }

      if (selectedTest.storage_version === 'v2') {
        const upload = await uploadV2Tests([selectedTest]);
        if (upload.latestCompletedAt) {
          setLastSyncAt(new Date(upload.latestCompletedAt).getTime());
        }
        refreshData();
        if (upload.failedResults > 0 || upload.errors.length > 0) {
          const prefix = upload.uploadedResults > 0 ? 'Upload partially successful.' : 'Upload failed.';
          showSyncStatusMessage(`${prefix} Uploaded: ${upload.uploadedResults}, failed: ${upload.failedResults}. ${upload.errors.join(' ')}`.trim());
        } else if (upload.uploadedResults === 0) {
          showSyncStatusMessage('Uploaded successfully. No pending verified results were found for this assessment.');
        } else {
          showSyncStatusMessage(`Uploaded successfully. Results: ${upload.uploadedResults}.`);
        }
        return;
      }

      const result = await uploadUnsyncedResults(activeTeacherId, selectedTest?.test_id);
      if (!result.success) {
        showSyncStatusMessage(`Upload failed. ${result.error || 'Unable to upload current test.'}`);
        return;
      }

      if (result.noData) {
        refreshData();
        showSyncStatusMessage('Uploaded successfully. No unsynced checked results were found for the selected test.');
        return;
      }

      const resolvedClassId = selectedClass?.class_id ?? selectedTest?.class_id ?? null;
      const syncedAt = new Date();
      if (resolvedClassId != null) {
        setClassLastSyncedAt(resolvedClassId, activeTeacherId, syncedAt.toISOString());
      }
      setLastSyncAt(syncedAt.getTime());

      refreshData();
      const summary = result.summary || {
        uploadedResults: 0,
        uploadedItems: 0,
        duplicateResults: 0,
        duplicateItems: 0,
      };

      showSyncStatusMessage(buildUploadStatusMessage(summary));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload sync data.';
      showSyncStatusMessage(`Upload failed. ${message}`);
    } finally {
      if (uploadStarted) {
        endUpload();
      }
    }
  };

  const handleUploadAllSync = async () => {
    let uploadStarted = false;
    try {
      if (activeTeacherId == null) {
        dialog.info({ title: 'Sync Error', message: 'Teacher account is not available. Please log in again.' });
        return;
      }

      if (!v1SessionAvailable && classes.some((classItem: any) => classItem.storage_version === 'v2')) {
        showSyncStatusMessage('Upload failed. Upload each class separately so every assessment batch can be confirmed.');
        return;
      }

      uploadStarted = beginUpload('all');
      if (!uploadStarted) {
        return;
      }

      const classIdsToStamp = classes
        .filter((classItem: any) => {
          if (classItem.storage_version === 'v2') {
            return false;
          }

          const classTests = getTestsByClass(classItem.class_id);
          return classTests.some((test: any) => {
            const status = getSelectedTestSyncStatus(test.test_id, classItem.class_id);
            return (status?.unsyncedStudents ?? 0) > 0;
          });
        })
        .map((classItem: any) => classItem.class_id);

      const result = await uploadAllUnsyncedResults(activeTeacherId);
      if (!result.success) {
        showSyncStatusMessage(`Upload failed. ${result.error || 'Unable to upload all unsynced data.'}`);
        return;
      }

      if (!result.noData && classIdsToStamp.length > 0) {
        const syncedAt = new Date();
        classIdsToStamp.forEach((classId: number) => {
          setClassLastSyncedAt(classId, activeTeacherId, syncedAt.toISOString());
        });
        setLastSyncAt(syncedAt.getTime());
      }

      refreshData();
      const summary = result.summary || {
        uploadedResults: 0,
        uploadedItems: 0,
        duplicateResults: 0,
        duplicateItems: 0,
      };

      showSyncStatusMessage(buildUploadStatusMessage(summary));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload all unsynced data.';
      showSyncStatusMessage(`Upload failed. ${message}`);
    } finally {
      if (uploadStarted) {
        endUpload();
      }
    }
  };

  const handleUploadClassSync = async (classItem: any) => {
    let uploadStarted = false;
    try {
      if (activeTeacherId == null) {
        dialog.info({ title: 'Sync Error', message: 'Teacher account is not available. Please log in again.' });
        return;
      }

      uploadStarted = beginUpload(`class:${classItem.class_id}`);
      if (!uploadStarted) {
        return;
      }

      if (classItem.storage_version === 'v2') {
        const classTests = getV2TestsByClass(classItem.class_id, classItem.class_assignment_id);
        const unsyncedTests = classTests.filter(test =>
          getV2TestSyncStatus(test.test_id, classItem.class_id).unsyncedStudents > 0,
        );
        const upload = await uploadV2Tests(unsyncedTests);
        if (upload.latestCompletedAt) {
          setLastSyncAt(new Date(upload.latestCompletedAt).getTime());
        }
        refreshData();
        if (upload.failedResults > 0 || upload.errors.length > 0) {
          const prefix = upload.uploadedResults > 0 ? 'Upload partially successful.' : 'Upload failed.';
          showSyncStatusMessage(`${prefix} Uploaded: ${upload.uploadedResults}, failed: ${upload.failedResults}. ${upload.errors.join(' ')}`.trim());
        } else if (upload.uploadedResults === 0) {
          showSyncStatusMessage('Uploaded successfully. No pending verified results were found for this class.');
        } else {
          showSyncStatusMessage(`Uploaded successfully. Results: ${upload.uploadedResults}.`);
        }
        return;
      }

      const classTests = getTestsByClass(classItem.class_id);
      const unsyncedTests = classTests.filter((test: any) => {
        const status = getSelectedTestSyncStatus(test.test_id, classItem.class_id);
        return (status?.unsyncedStudents ?? 0) > 0;
      });

      if (unsyncedTests.length === 0) {
        showSyncStatusMessage('Uploaded successfully. No unsynced checked results were found for this class.');
        return;
      }

      const totalSummary = {
        uploadedResults: 0,
        uploadedItems: 0,
        duplicateResults: 0,
        duplicateItems: 0,
      };
      let uploadedPayload = false;

      for (const test of unsyncedTests) {
        const result = await uploadUnsyncedResults(activeTeacherId, test.test_id);
        if (!result.success) {
          showSyncStatusMessage(`Upload failed. ${result.error || 'Unable to upload class results.'}`);
          refreshData();
          return;
        }

        if (!result.noData && result.summary) {
          uploadedPayload = true;
          totalSummary.uploadedResults += result.summary.uploadedResults ?? 0;
          totalSummary.uploadedItems += result.summary.uploadedItems ?? 0;
          totalSummary.duplicateResults += result.summary.duplicateResults ?? 0;
          totalSummary.duplicateItems += result.summary.duplicateItems ?? 0;
        }
      }

      if (uploadedPayload) {
        const syncedAt = new Date();
        setClassLastSyncedAt(classItem.class_id, activeTeacherId, syncedAt.toISOString());
        setLastSyncAt(syncedAt.getTime());
      }
      refreshData();
      showSyncStatusMessage(buildUploadStatusMessage(totalSummary));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload class sync data.';
      showSyncStatusMessage(`Upload failed. ${message}`);
    } finally {
      if (uploadStarted) {
        endUpload();
      }
    }
  };

  const handleClearLocalData = () => {
    dialog.confirm({
      title: 'Clear Local Data?',
      message: 'This will delete local classes, students, tests, test parts, competencies, and offline checking results from this phone.',
      confirmLabel: 'Clear Local Data',
      destructive: true,
      onConfirm: () => {
            const result = clearLocalTestingData();
            if (!result.success) {
              dialog.info({ title: 'Clear Failed', message: result.error || 'Unable to clear local testing data.' });
              return;
            }

            setSelectedClass(null);
            setSelectedTest(null);
            setSelectedStudent(null);
            setRoster([]);
            setStats({ average: 0, gradedCount: 0, topStudent: 'N/A' });
            setAnalyticsData({ competencyPerformance: [], itemAnalysis: [] });
            setSelectedTestStatus(null);
            setRosterDebug(null);
            setIsSyncCenterOpen(false);
            setSyncStatusBanner(null);
            setLastSyncAt(null);
            setStudentSearch('');
            setView('CLASSES');
            setActiveTab('CLASSES');
            setProfileMode('PROFILE');
            refreshData();

            dialog.info({ title: 'Local Data Cleared', message: 'Local testing data has been cleared successfully.' });
      },
    });
  };

  const handleLogout = () => {
    if (v3Session) {
      defaultV3DiagnosticsConnection
        .logout(V3_BASE_URL, v3Session)
        .catch(error => {
          console.log('V3 AUTH: Server logout failed; protected local session was cleared.', error);
        });
    }
    setIsLoggedIn(false);
    setV1SessionAvailable(false);
    setV2AccessToken(null);
    setV3Session(null);
    setV3Snapshot(null);
    setIsV3ObjectiveOpen(false);
    setTeacher(null);
    setActiveTab('CLASSES');
    setIsSyncCenterOpen(false);
    setSyncStatusBanner(null);
    setLastSyncAt(null);
    uploadInProgressRef.current = false;
    setActiveUploadKey(null);
    setView('LOGIN');
    setProfileMode('PROFILE');
    setSelectedClass(null);
    setSelectedTest(null);
    setSelectedStudent(null);
    setRoster([]);
    setAnalyticsData({ competencyPerformance: [], itemAnalysis: [] });
    setSelectedTestStatus(null);
    setRosterDebug(null);
    setIsOffline(false);
  };

  // Logging out only clears the sign-in: results saved on this phone (sent or
  // not) stay in its database and can be sent after logging in again.
  const confirmLogout = () => {
    dialog.confirm({
      title: 'Log out?',
      message: 'Your saved results stay on this phone.',
      confirmLabel: 'Log out',
      onConfirm: handleLogout,
    });
  };

  const openExternalLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      showToast({ variant: 'error', message: "Couldn't open the link. Check that a browser or email app is installed." });
    });
  };

  const totalStudentsChecked = stats.gradedCount;
  const averageScore = stats.average;
  const filteredStudents = roster.filter((student: any) =>
    `${student.first_name} ${student.last_name}`.toLowerCase().includes(studentSearch.toLowerCase())
  );
  const studentSuggestions = studentSearch.trim().length > 0 ? filteredStudents.slice(0, 8) : [];
  const currentStudentIndex = roster.findIndex((student: any) => student.student_id === selectedStudent?.student_id);
  const hasNextStudent = currentStudentIndex >= 0 && currentStudentIndex < roster.length - 1;
  const isCurrentV2StudentSaved = selectedTest?.storage_version === 'v2'
    && Number(selectedStudent?.is_checked) === 1;
  const studentProgressRows = [...roster]
    .map((student: any) => ({
      ...student,
      isChecked: Number(student.is_checked) === 1,
    }))
    .sort((left: any, right: any) => {
      if (left.isChecked !== right.isChecked) {
        return left.isChecked ? -1 : 1;
      }

      const leftName = `${left.last_name ?? ''} ${left.first_name ?? ''}`.trim().toLowerCase();
      const rightName = `${right.last_name ?? ''} ${right.first_name ?? ''}`.trim().toLowerCase();
      return leftName.localeCompare(rightName);
    });
  const checkedStudentCount = studentProgressRows.filter((student: any) => student.isChecked).length;
  const selectedStudentName = selectedStudent
    ? [selectedStudent.last_name, selectedStudent.first_name].filter(Boolean).join(', ') || 'Anonymous Student'
    : 'Select Student';
  const studentProgressLabel = currentStudentIndex >= 0
    ? `Student ${currentStudentIndex + 1} of ${roster.length}`
    : `Student 0 of ${roster.length}`;
  const selectedClassLabel = selectedClass
    ? [selectedClass.subject_name, selectedClass.grade_level_name, selectedClass.section_name].filter(Boolean).join(' • ')
    : 'No class selected';
  const selectedTestLabel = selectedTest?.test_name || 'No test selected';
  const selectedUploadStatus = !selectedTest
    ? 'No test selected'
    : (selectedTestStatus?.unsyncedStudents ?? 0) > 0
      ? 'Pending Upload'
      : (selectedTestStatus?.syncedStudents ?? 0) > 0
        ? 'Synced'
        : (selectedTestStatus?.checkedStudents ?? 0) > 0
          ? 'Unsynced'
          : 'No checked results yet';
  const classCardData = useMemo(() => classes.map((item: any) => {
    const debugInfo = item.storage_version === 'v2' || item.storage_version === 'v3'
      ? null
      : getRosterDebugInfo(item.class_id);

    return {
      ...item,
      student_count: item.storage_version === 'v2' || item.storage_version === 'v3'
        ? Number(item.student_count ?? 0)
        : debugInfo?.localStudentsFound ?? null,
      statusLabel: item.storage_version === 'v3' && v3Snapshot
        ? v3ClassStatusLabel(v3Snapshot, item)
        : undefined,
      offlineLabel: 'Available offline',
    };
    // dataVersion: re-read the saved results after a scan is saved or sent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [classes, v3Snapshot, dataVersion]);
  const testCardData = tests.map((item: any) => {
    const syncStatus = selectedClass?.class_id != null
      ? item.storage_version === 'v3'
        ? null
        : item.storage_version === 'v2'
        ? getV2TestSyncStatus(item.test_id, selectedClass.class_id)
        : getSelectedTestSyncStatus(item.test_id, selectedClass.class_id)
      : null;

    let checkingStatus = item.storage_version === 'v3'
      ? item.assignment_status || 'Downloaded'
      : 'Ready to check';
    if (syncStatus) {
      if (syncStatus.checkedStudents === 0) {
        checkingStatus = 'Not checked yet';
      } else if (syncStatus.unsyncedStudents > 0) {
        checkingStatus = 'Checked locally';
      } else if (syncStatus.syncedStudents > 0) {
        checkingStatus = 'Uploaded';
      }
    }

    // A V3 assignment's raw assignment_status (open/closed/scheduled) only
    // reflects the teacher-configured schedule window, not whether checking
    // is actually done - it stays "OPEN" forever even after every student is
    // finalized, which reads as "still needs work" when there's none left.
    // "Complete" here means CHECKED, the same bar V3ObjectiveWorkflowModal's
    // own "X/Y checked" counter uses (officialScore OR operationStage) - not
    // "synced to the backend". A teacher's checking work is done the moment
    // every student is reviewed and saved on the phone; sync is a separate,
    // connectivity-dependent step that can legitimately lag behind that
    // without the test itself still reading as "needs work".
    let assignmentStatus = item.assignment_status;
    if (item.storage_version === 'v3' && selectedClass?.class_id != null) {
      const v3Students = getV3ObjectiveStudents(item.test_assignment_id, selectedClass.class_id);
      if (
        v3Students.length > 0 &&
        v3Students.every((student: any) => student.officialScore !== null || student.operationStage !== null)
      ) {
        assignmentStatus = 'complete';
      }
    }

    return {
      ...item,
      assignment_status: assignmentStatus,
      syncStatus,
      checking_status: checkingStatus,
    };
  });
  const displayedLocalCounts = v3Snapshot
    ? {
        classes: v3Snapshot.counts.classes,
        students: v3Snapshot.counts.students,
        tests: v3Snapshot.counts.testAssignments,
        testParts: v3Snapshot.counts.testParts,
      }
    : localCounts;
  const teacherName = teacher
    ? [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || 'Teacher'
    : 'Teacher';
  const classLastSyncedMap = v1SessionAvailable
    ? getClassLastSyncedMap(activeTeacherId) as Record<number, string | null>
    : {};
  const v2ClassLastSyncedMap = !v1SessionAvailable && v2AccessToken && activeTeacherId != null
    ? getLatestV2SyncByAssignment(activeTeacherId)
    : {};
  const activeClassLastSyncedMap = v1SessionAvailable ? classLastSyncedMap : v2ClassLastSyncedMap;
  const latestStoredClassSyncAt = Object.values(activeClassLastSyncedMap).reduce<string | null>((latest, current) => {
    if (!current) {
      return latest;
    }

    if (!latest) {
      return current;
    }

    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  }, null);
  const lastSyncDisplay = formatLastSync(lastSyncAt ?? latestStoredClassSyncAt);
  const syncClassCards = classCardData
  .filter((classItem: any) => classItem.storage_version !== 'v3')
  .map((classItem: any) => {
    const isV2Class = classItem.storage_version === 'v2';
    const classTests = isV2Class
      ? getV2TestsByClass(classItem.class_id, classItem.class_assignment_id)
      : getTestsByClass(classItem.class_id);
    const classStatuses = isV2Class
      ? classTests.map((test: any) => getV2TestSyncStatus(test.test_id, classItem.class_id))
      : classTests.map((test: any) => getSelectedTestSyncStatus(test.test_id, classItem.class_id));
    const checkedStudents = classStatuses.reduce((total: number, status: any) => total + (status?.checkedStudents ?? 0), 0);
    const syncedStudents = classStatuses.reduce((total: number, status: any) => total + (status?.syncedStudents ?? 0), 0);
    const unsyncedStudents = classStatuses.reduce((total: number, status: any) => total + (status?.unsyncedStudents ?? 0), 0);
    const statusLabel = unsyncedStudents > 0 ? 'Unsynced' : checkedStudents > 0 || syncedStudents > 0 ? 'Synced' : 'No Records';

    return {
      ...classItem,
      classTests,
      checkedStudents,
      syncedStudents,
      unsyncedStudents,
      statusLabel,
      totalAssessments: classTests.length,
      subjectLabel: classItem.subject_name || 'No subject',
      exactLastSync: formatLastSync(
        isV2Class
          ? v2ClassLastSyncedMap[classItem.class_assignment_id] ?? null
          : classLastSyncedMap[classItem.class_id] ?? null,
      ),
      testPreview: classTests.slice(0, 2).map((test: any) => test.test_name).filter(Boolean),
    };
  });
  const totalClassCheckedStudents = syncClassCards.reduce((total: number, item: any) => total + item.checkedStudents, 0);

  const renderClassesFlow = () => {
    // 1. CLASSES VIEW - Show list of classes for the teacher
    if (view === 'CLASSES') {
      return (
        <ClassList
          data={classCardData}
          onSelect={handleSelectClass}
          onRefresh={source => { handleDownloadSync(source); }}
          refreshing={isRefreshing}
          offline={isOffline}
        />
      );
    }

    // 2. TESTS VIEW - Show tests for the selected class
    if (view === 'TESTS' && selectedClass) {
      return (
        <TestList
          classItem={selectedClass}
          data={testCardData}
          onSelect={handleSelectTest}
          onBack={() => {
            setSelectedClass(null);
            setView('CLASSES');
          }}
          onRefresh={() => { handleDownloadSync('pull'); }}
          refreshing={isRefreshing}
          offline={isOffline}
        />
      );
    }

    // 3. CHECKING VIEW - Show student checking grid for the selected test
    if (view === 'CHECKING' && selectedTest) {
      return (
        <View style={styles.screenContainer}>
          <View style={styles.checkingMainLayout}>
            <View style={styles.checkingTopContainer}>
              <View style={styles.checkingHeader}>
                <TouchableOpacity
                  style={styles.checkingBackButton}
                  onPress={() => {
                    setSelectedTest(null);
                    setSelectedStudent(null);
                    setStudentSearch('');
                    setView('TESTS');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.checkingBackText}>‹</Text>
                </TouchableOpacity>

                <View style={styles.checkingTitleRow}>
                  <View style={styles.testInfoPill}>
                    <Text style={styles.testInfo} numberOfLines={1}>{selectedTest.test_name}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.studentProgressChip}
                    activeOpacity={0.85}
                    onPress={() => setIsStudentListOpen((current) => !current)}
                  >
                    <UserCircle size={17} color="#0F7A34" strokeWidth={2.6} />
                    <Text style={styles.studentProgressChipText}>{studentProgressLabel}</Text>
                    <ChevronDown size={15} color="#0F7A34" strokeWidth={2.8} />
                  </TouchableOpacity>
                </View>

                <View style={styles.currentScoreCard}>
                  <Text style={styles.currentScoreLabel}>CURRENT SCORE</Text>
                  <View style={styles.currentScoreRow}>
                    <Text style={styles.currentScoreValue}>{selectedStudent?.score ?? 0}</Text>
                    <Text style={styles.currentScoreTotal}>
                      {' / '}
                      {selectedStudent?.maxScore ?? selectedTest.total_items}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.checkingGridSection}>
              {selectedStudent ? (
                selectedTest.storage_version === 'v2' ? (
                  <View style={styles.v2ScanReadyState}>
                    <ScanLine size={38} color="#20B94B" strokeWidth={2.2} />
                    <Text style={styles.v2ScanReadyTitle}>Ready to scan</Text>
                    <Text style={styles.v2ScanReadyText}>
                      Scan the selected student's approved bubble sheet, then review every detected answer before saving.
                    </Text>
                  </View>
                ) : (
                  <CheckingGrid
                    ref={checkingGridRef}
                    key={`${selectedTest.test_id}-${selectedStudent.student_id}`}
                    totalItems={selectedTest.total_items}
                    testId={selectedTest.test_id}
                    studentId={selectedStudent.student_id}
                    onScoreChange={handleGridScoreChange}
                  />
                )
              ) : (
                <View style={styles.emptyCheckingState}>
                  <Text style={styles.emptyCheckingText}>Select a student to start checking.</Text>
                </View>
              )}
            </View>

            <View style={styles.checkingActionBar}>
              {selectedTest.storage_version !== 'v2' ? (
                <View style={styles.answerLegendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.correctLegendSwatch]} />
                    <Text style={styles.legendText}>TAP FOR CORRECT</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.wrongLegendSwatch]} />
                    <Text style={styles.legendText}>TAP FOR WRONG</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.bottomStudentRow}>
                <Text style={styles.bottomStudentLabel}>Student:</Text>
                <View style={styles.studentSearchShell}>
                  <View style={styles.studentSearchSection}>
                    <TextInput
                      style={styles.studentSearchInput}
                      placeholder={isStudentSearchFocused ? '' : selectedStudentName}
                      placeholderTextColor="#111827"
                      value={studentSearch}
                      onChangeText={setStudentSearch}
                      onFocus={() => {
                        setIsStudentSearchFocused(true);
                        setStudentSearch('');
                      }}
                      onBlur={() => setIsStudentSearchFocused(false)}
                    />
                  </View>

                  {studentSearch.trim().length > 0 ? (
                    <View style={styles.studentSuggestionsSection}>
                      {studentSuggestions.length > 0 ? (
                        studentSuggestions.map((item: any) => (
                          <TouchableOpacity
                            key={item.student_id}
                            style={styles.studentSuggestionRow}
                            onPress={() => handleSelectStudent(item)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.studentSuggestionCopy}>
                              <Text style={styles.studentSuggestionName}>{item.last_name}, {item.first_name}</Text>
                              <Text style={styles.studentSuggestionMeta}>Score: {item.score ?? 0}</Text>
                            </View>
                            <Text style={styles.studentSuggestionAction}>Select</Text>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <View style={styles.studentEmptyState}>
                          <Text style={styles.studentEmptyText}>
                            {roster.length === 0 ? 'No downloaded students are available for this test yet.' : 'No matching students.'}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>

              {saveFeedback ? (
                <Animated.View style={[styles.saveFeedbackBanner, {opacity: saveFeedbackOpacity}]}>
                  <Text style={styles.saveFeedbackText}>{saveFeedback}</Text>
                </Animated.View>
              ) : null}

              <View style={styles.checkingActionButtonsRow}>
                <TouchableOpacity
                  style={[styles.omrScanButton, !selectedStudent && styles.disabledActionButton]}
                  onPress={() => {
                    setOmrScannerMode(isCurrentV2StudentSaved ? 'view' : 'scan');
                    setIsOmrScannerOpen(true);
                  }}
                  activeOpacity={0.9}
                  disabled={!selectedStudent}
                >
                  {isCurrentV2StudentSaved ? (
                    <BookOpen size={17} color={!selectedStudent ? '#6B7280' : '#FFFFFF'} strokeWidth={2.8} />
                  ) : (
                    <ScanLine size={17} color={!selectedStudent ? '#6B7280' : '#FFFFFF'} strokeWidth={2.8} />
                  )}
                  <Text style={[styles.omrScanButtonText, !selectedStudent && styles.disabledActionButtonText]}>
                    {isCurrentV2StudentSaved ? 'VIEW SCAN & ANSWERS' : 'SCAN SHEET'}
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedTest.storage_version === 'v2' ? (
                <View style={styles.checkingActionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.primaryActionButton, (!selectedStudent || !isCurrentV2StudentSaved) && styles.disabledActionButton]}
                    onPress={hasNextStudent ? handleNextStudent : handleFinishV2Checking}
                    activeOpacity={0.9}
                    disabled={!selectedStudent || !isCurrentV2StudentSaved}
                  >
                    <Text style={[styles.primaryActionButtonText, (!selectedStudent || !isCurrentV2StudentSaved) && styles.disabledActionButtonText]}>
                      {hasNextStudent ? 'NEXT STUDENT ›' : 'FINISH CHECKING'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.checkingActionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.secondaryActionButton, !selectedStudent && styles.disabledSecondaryButton]}
                    onPress={handleSaveCurrentStudent}
                    activeOpacity={0.9}
                    disabled={!selectedStudent}
                  >
                    <Save size={15} color={!selectedStudent ? '#6B7280' : '#FFFFFF'} strokeWidth={2.8} />
                    <Text style={[styles.secondaryActionButtonText, !selectedStudent && styles.disabledActionButtonText]}>SAVE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryActionButton, (!hasNextStudent || !selectedStudent) && styles.disabledActionButton]}
                    onPress={handleSaveAndNextStudent}
                    activeOpacity={0.9}
                    disabled={!hasNextStudent || !selectedStudent}
                  >
                    <Text style={[styles.primaryActionButtonText, (!hasNextStudent || !selectedStudent) && styles.disabledActionButtonText]}>
                      NEXT ›
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Modal
              visible={isStudentListOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setIsStudentListOpen(false)}
            >
              <View style={styles.studentProgressModalOverlay}>
                <View style={styles.studentProgressModalCard}>
                  <View style={styles.studentProgressModalHeader}>
                    <View style={styles.studentProgressModalHeaderCopy}>
                      <Text style={styles.studentProgressModalTitle}>Students</Text>
                      <Text style={styles.studentProgressModalMeta}>
                        {checkedStudentCount} checked / {roster.length} total
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.studentProgressModalClose}
                      activeOpacity={0.85}
                      onPress={() => setIsStudentListOpen(false)}
                    >
                      <X size={18} color="#17261B" strokeWidth={2.6} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={styles.studentProgressModalList}
                    contentContainerStyle={styles.studentProgressModalListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {studentProgressRows.map((student: any) => {
                      const isSelected = student.student_id === selectedStudent?.student_id;

                      return (
                        <TouchableOpacity
                          key={student.student_id}
                          style={[
                            styles.studentProgressRow,
                            isSelected && styles.studentProgressRowActive,
                          ]}
                          activeOpacity={0.85}
                          onPress={() => handleSelectStudent(student)}
                        >
                          <View style={styles.studentProgressRowCopy}>
                            <Text style={styles.studentProgressRowName}>
                              {student.last_name}, {student.first_name}
                            </Text>
                            <Text style={styles.studentProgressRowStatus}>
                              {student.isChecked ? 'Checked' : 'Unchecked'}
                            </Text>
                          </View>

                          <View style={styles.studentProgressRowMeta}>
                            <View
                              style={[
                                styles.studentProgressBadge,
                                student.isChecked
                                  ? styles.studentProgressBadgeChecked
                                  : styles.studentProgressBadgeUnchecked,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.studentProgressBadgeText,
                                  student.isChecked
                                    ? styles.studentProgressBadgeTextChecked
                                    : styles.studentProgressBadgeTextUnchecked,
                                ]}
                              >
                                {student.isChecked ? 'Checked' : 'Unchecked'}
                              </Text>
                            </View>

                            {student.isChecked ? (
                              <Text style={styles.studentProgressRowScore}>
                                {student.score ?? 0}
                              </Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </Modal>

            <OmrScannerModal
              visible={isOmrScannerOpen}
              teacherId={activeTeacherId}
              test={selectedTest}
              student={selectedStudent}
              classData={selectedClass}
              mode={omrScannerMode}
              onClose={() => setIsOmrScannerOpen(false)}
              onSaved={() => {
                const wasAlreadyChecked = Number(selectedStudent?.is_checked) === 1;
                const updatedRoster = selectedTest?.test_id && selectedClass?.class_id
                  ? getV2RosterForTest(selectedTest.test_id, selectedClass.class_id)
                  : [];
                refreshData();
                showSaveFeedback('Student result saved.');

                if (!wasAlreadyChecked && updatedRoster.length > 0 && updatedRoster.every(student => Number(student.is_checked) === 1)) {
                  setTimeout(() => {
                    dialog.info({
                      title: 'Checking Complete',
                      message: `All ${updatedRoster.length} student results are saved on this device.`,
                    });
                  }, 250);
                }
              }}
            />
          </View>
        </View>
      );
    }

    return <View style={styles.screenContainer} />;
  };

  const renderProfile = () => {
    if (profileMode === 'SYNC') {
      return (
        <View style={styles.tabScreen}>
          <ScreenHeader
            title="Synchronization"
            subtitle="Upload recorded assessment results to the server."
            onBack={() => setProfileMode('PROFILE')}
            backLabel="Back to Profile"
            busy={activeUploadKey !== null}
          />
          <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {syncClassCards.length > 0 ? (
              syncClassCards.map((item: any) => {
                const isUploading = activeUploadKey === `class:${item.class_id}` || activeUploadKey === 'all';
                const classLabel = [item.grade_level_name, item.section_name].filter(Boolean).join(' - ') || item.subject_name || 'Class';
                const statusTone = item.statusLabel === 'Unsynced' ? 'warning' : item.statusLabel === 'Synced' ? 'success' : 'neutral';

                return (
                  <Card
                    key={item.class_id}
                    onPress={() => handleUploadClassSync(item)}
                    disabled={activeUploadKey !== null}
                    accessibilityLabel={`${classLabel}, ${item.subjectLabel}, ${isUploading ? 'Uploading' : item.statusLabel}`}
                    accessibilityHint="Uploads this class's checked results"
                  >
                    <View style={styles.syncCardHeader}>
                      <View style={styles.flexOne}>
                        <Text style={styles.cardTitle}>{classLabel}</Text>
                        <Text style={styles.caption}>{item.subjectLabel}</Text>
                      </View>
                      <Badge label={isUploading ? 'Uploading' : item.statusLabel} tone={isUploading ? 'info' : statusTone} />
                    </View>
                    {[
                      ['Assessments', item.totalAssessments],
                      ['Students Checked', item.checkedStudents],
                      ['Pending Upload', item.unsyncedStudents],
                      ['Last Sync', item.exactLastSync],
                    ].map(([label, value]) => (
                      <View key={label} style={styles.syncInfoRow}>
                        <Text style={styles.syncInfoLabel}>{label}</Text>
                        <Text style={styles.syncInfoValue}>{value}</Text>
                      </View>
                    ))}
                    {item.testPreview.length > 0 ? (
                      item.testPreview.map((testName: string) => (
                        <Text key={testName} style={styles.caption}>{testName}</Text>
                      ))
                    ) : (
                      <Text style={styles.caption}>No downloaded assessments</Text>
                    )}
                  </Card>
                );
              })
            ) : (
              <EmptyState
                icon={School}
                title="No classes available"
                message="Download assigned data first from the Classes screen."
              />
            )}

            {syncStatusBanner ? (
              <Banner
                tone={
                  syncStatusBanner.tone === 'error'
                    ? 'danger'
                    : syncStatusBanner.tone === 'partial'
                      ? 'warning'
                      : syncStatusBanner.tone === 'success'
                        ? 'success'
                        : 'info'
                }
                message={syncStatusBanner.message}
              />
            ) : null}
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={styles.tabScreen}>
        <TabHeader title="Profile" />
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHero}>
            <Avatar name={teacherName} />
            <View style={styles.flexOne}>
              <Text style={styles.profileName}>{teacherName}</Text>
              {teacher?.email ? <Text style={styles.profileEmail}>{teacher.email}</Text> : null}
              <Badge label="Teacher" tone="neutral" style={styles.profileBadge} />
            </View>
          </View>

          <Text style={styles.sectionLabel} accessibilityRole="header">Account Details</Text>
          <Card padded={false}>
            <ListRow
              bordered={false}
              title="Email Address"
              subtitle={teacher?.email || 'No email available'}
              left={<Mail size={theme.iconSize.small} color={theme.colors.muted} strokeWidth={2.2} />}
            />
            <ListRow
              bordered={false}
              divider
              title="Classes Assigned"
              subtitle={`${displayedLocalCounts.classes} Classes Assigned`}
              left={<BookOpen size={theme.iconSize.small} color={theme.colors.muted} strokeWidth={2.2} />}
            />
            {!v3Session ? (
              <ListRow
                bordered={false}
                divider
                title="Synchronization"
                subtitle={`Last sync: ${lastSyncDisplay}`}
                left={<RefreshCw size={theme.iconSize.small} color={theme.colors.muted} strokeWidth={2.2} />}
                right="chevron"
                onPress={() => setProfileMode('SYNC')}
              />
            ) : null}
          </Card>

          <Text style={styles.sectionLabel} accessibilityRole="header">Help</Text>
          <Card padded={false}>
            {[
              { title: 'User guide', icon: BookOpen, url: USER_GUIDE_URL },
              { title: 'Privacy notice', icon: ShieldCheck, url: PRIVACY_NOTICE_URL },
              { title: 'Contact us', icon: Mail, url: CONTACT_URL },
            ].map(({ title, icon: Icon, url }, index) => (
              <ListRow
                key={title}
                bordered={false}
                divider={index > 0}
                title={title}
                left={<Icon size={theme.iconSize.small} color={theme.colors.primary} strokeWidth={2.2} />}
                right={<ExternalLink size={theme.iconSize.small} color={theme.colors.muted} strokeWidth={2.2} />}
                accessibilityRole="link"
                accessibilityHint={title === 'Contact us' ? 'Opens your email app' : 'Opens in your browser'}
                onPress={() => openExternalLink(url)}
              />
            ))}
          </Card>

          <Text style={styles.sectionLabel} accessibilityRole="header">About</Text>
          <Card>
            <Text style={styles.cardTitle}>{APP_DISPLAY_NAME}</Text>
            <Text style={styles.aboutText}>Version {APP_VERSION}</Text>
            <Text style={styles.aboutText}>{APP_CREDIT}</Text>
          </Card>

          <Button
            label="Log out"
            variant="dangerOutline"
            fullWidth
            onPress={confirmLogout}
            style={styles.logoutButton}
          />
        </ScrollView>
      </View>
    );
  };

  const renderMainContent = () => {
    if (activeTab === 'ANALYTICS') {
      return (
        <AnalyticsView
          totalStudentsChecked={totalStudentsChecked}
          averageScore={averageScore}
          selectedClass={selectedClass}
          classes={classCardData}
          selectedTest={selectedTest}
          tests={testCardData}
          roster={roster}
          analyticsData={analyticsData}
          selectedTestStatus={selectedTestStatus}
          localCounts={displayedLocalCounts}
          onSelectClass={handleSelectAnalyticsClass}
          onSelectAssessment={handleSelectAnalyticsAssessment}
          onGoToClasses={() => {
            setActiveTab('CLASSES');
            setView('CLASSES');
          }}
        />
      );
    }

    if (activeTab === 'PROFILE') {
      return renderProfile();
    }

    return renderClassesFlow();
  };

  return (
    <>
      {/* White behind the status bar and the gesture area, matching the white headers and tab bar. */}
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.surface} />
      {isLoggedIn ? <V3ServerWakingNotice style={styles.serverWakingNotice} /> : null}

      {/* 1. LOGIN */}
      {!isLoggedIn && view === 'LOGIN' && (
        isRestoringSession ? <LoginLoading /> : <LoginScreen key={loginFormKey} onLogin={handleLogin} />
      )}

      <DynamicOmrScannerPrototype
        visible={isDynamicOmrTestOpen}
        onClose={() => setIsDynamicOmrTestOpen(false)}
      />

      {v3InitialLoginRequest ? (
        <V3LoginFlow
          key={v3InitialLoginRequest.requestId}
          request={v3InitialLoginRequest}
          onAuthenticated={handleV3Authenticated}
          onClose={() => setV3InitialLoginRequest(null)}
          onAccountRejected={() => {
            setV3InitialLoginRequest(null);
            setLoginFormKey(key => key + 1);
          }}
        />
      ) : null}

      {v3Session && selectedTest?.storage_version === 'v3' && selectedClass ? (
        <V3ObjectiveWorkflowModal
          visible={isV3ObjectiveOpen}
          session={v3Session}
          test={selectedTest}
          classData={selectedClass}
          onClose={() => setIsV3ObjectiveOpen(false)}
          onChanged={refreshData}
          onSessionInvalid={() => {
            setIsV3ObjectiveOpen(false);
            setIsLoggedIn(false);
            setTeacher(null);
            setV3Session(null);
            setView('LOGIN');
            dialog.info({
              title: 'Session Expired',
              message: 'Sign in again. Saved V3 result operations remain on this phone.',
            });
          }}
        />
      ) : null}

      {isLoggedIn && (
        <View style={styles.mainLayout}>
          <View style={styles.contentArea}>{renderMainContent()}</View>
          {view !== 'CHECKING' && view !== 'TESTS' && !(activeTab === 'PROFILE' && profileMode === 'SYNC') && (
            <TabBar tabs={MAIN_TABS} activeKey={activeTab} onChange={setActiveTab} />
          )}
        </View>
      )}
    </>
  );
};

const App = (): React.JSX.Element => (
  <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <DialogProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </DialogProvider>
    </SafeAreaView>
  </SafeAreaProvider>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  mainLayout: { flex: 1, backgroundColor: theme.colors.bg },
  contentArea: { flex: 1 },
  screenContainer: { flex: 1, backgroundColor: theme.colors.bg },
  checkingHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#F5F6FA',
  },
  checkingBackButton: {
    alignSelf: 'flex-start',
    width: 42,
    height: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginLeft: 6,
    marginTop: -1,
  },
  checkingBackText: {
    color: '#111827',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 39,
  },
  checkingTitleRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  studentProgressChip: {
    backgroundColor: '#CFEFD7',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  studentProgressChipText: {
    color: '#0F7A34',
    fontSize: 12,
    fontWeight: '900',
  },
  studentProgressModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  studentProgressModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBEFD7',
    maxHeight: '76%',
    overflow: 'hidden',
  },
  studentProgressModalHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  studentProgressModalHeaderCopy: {
    flex: 1,
  },
  studentProgressModalTitle: {
    color: '#17261B',
    fontSize: 14,
    fontWeight: '900',
  },
  studentProgressModalMeta: {
    color: '#607568',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  studentProgressModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentProgressModalList: {
    maxHeight: 420,
  },
  studentProgressModalListContent: {
    paddingVertical: 4,
  },
  studentProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  studentProgressRowActive: {
    backgroundColor: '#F3FCF6',
  },
  studentProgressRowCopy: {
    flex: 1,
  },
  studentProgressRowName: {
    color: '#17261B',
    fontSize: 14,
    fontWeight: '800',
  },
  studentProgressRowStatus: {
    color: '#607568',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  studentProgressRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  studentProgressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  studentProgressBadgeChecked: {
    backgroundColor: '#E6F8EA',
  },
  studentProgressBadgeUnchecked: {
    backgroundColor: '#F3F4F6',
  },
  studentProgressBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  studentProgressBadgeTextChecked: {
    color: '#0F7A34',
  },
  studentProgressBadgeTextUnchecked: {
    color: '#6B7280',
  },
  studentProgressRowScore: {
    minWidth: 32,
    color: '#0F7A34',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  testInfoPill: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: '#EAFBF0',
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  testInfo: { fontSize: 16, color: '#0F7A34', marginTop: 0, fontWeight: '900' },
  currentScoreCard: {
    marginTop: 8,
    backgroundColor: '#E9CDBF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E3A487',
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  currentScoreLabel: {
    color: '#D84D12',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  currentScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  currentScoreValue: {
    color: '#D84D12',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  currentScoreTotal: {
    color: '#D84D12',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 26,
  },
  checkingMainLayout: {
    flex: 1,
    position: 'relative',
    overflow: 'visible',
  },
  checkingTopContainer: {
    backgroundColor: '#F5F6FA',
    flexShrink: 0,
    zIndex: 30,
    overflow: 'visible',
  },
  studentSearchSection: {
    flex: 1,
    backgroundColor: '#F5F6FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6C7C0',
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: 42,
    justifyContent: 'center',
    zIndex: 1,
  },
  studentSearchShell: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
    overflow: 'visible',
  },
  sectionLabel: { ...theme.type.label, color: theme.colors.muted, marginTop: theme.spacing.sm, textTransform: 'uppercase' },
  studentSearchInput: {
    width: '100%',
    height: 40,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 17,
    color: '#111827',
    fontWeight: '700',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  studentSuggestionsSection: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBEFD7',
    overflow: 'hidden',
    maxHeight: 220,
    zIndex: 60,
  },
  studentSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  studentSuggestionCopy: {
    flex: 1,
  },
  studentSuggestionName: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '700',
  },
  studentSuggestionMeta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  studentSuggestionAction: {
    color: '#1E8E3E',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 12,
  },
  studentEmptyState: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  studentEmptyText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  checkingActionBar: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#F5F6FA',
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
    zIndex: 10,
    elevation: 10,
  },
  answerLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  correctLegendSwatch: {
    backgroundColor: '#35C94A',
  },
  wrongLegendSwatch: {
    backgroundColor: '#EF4444',
  },
  legendText: {
    color: '#19933A',
    fontSize: 8,
    fontWeight: '900',
  },
  bottomStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 42,
    marginBottom: 4,
    zIndex: 1,
  },
  bottomStudentLabel: {
    color: '#607568',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 64,
  },
  checkingActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    zIndex: 2,
  },
  omrScanButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: '#2DCE4A',
  },
  omrScanButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  saveFeedbackBanner: {
    backgroundColor: '#E4FBE9',
    borderWidth: 1,
    borderColor: '#3ACF49',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveFeedbackText: {
    color: '#0F7A34',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondaryActionButton: {
    flex: 1,
    backgroundColor: '#D9510B',
    borderRadius: 8,
    minHeight: 42,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledSecondaryButton: {
    backgroundColor: '#D1D5DB',
  },
  primaryActionButton: {
    flex: 1,
    backgroundColor: '#F1F3F4',
    borderWidth: 1,
    borderColor: '#CBD1D6',
    borderRadius: 8,
    minHeight: 42,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledActionButton: {
    backgroundColor: '#D1D5DB',
  },
  disabledActionButtonText: {
    color: '#6B7280',
  },
  checkingGridSection: {
    flex: 1,
    flexBasis: '65%',
    minHeight: 0,
    paddingTop: 0,
    paddingBottom: 8,
    backgroundColor: '#F5F6FA',
    zIndex: 1,
    elevation: 1,
  },
  emptyCheckingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyCheckingText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
  },
  v2ScanReadyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  v2ScanReadyTitle: {
    color: '#17261B',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 12,
  },
  v2ScanReadyText: {
    color: '#607568',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 7,
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
  },
  profileName: { ...theme.type.title, color: theme.colors.text },
  serverWakingNotice: {
    marginHorizontal: theme.screenPadding,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  syncInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  syncInfoLabel: { ...theme.type.caption, color: theme.colors.muted },
  syncInfoValue: { ...theme.type.label, color: theme.colors.text, flexShrink: 1, textAlign: 'right' },
  logoutButton: { marginTop: theme.spacing.lg },
  tabScreen: { flex: 1, backgroundColor: theme.colors.bg },
  tabContent: { padding: theme.screenPadding, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  flexOne: { flex: 1 },
  cardTitle: { ...theme.type.cardTitle, color: theme.colors.text },
  caption: { ...theme.type.caption, color: theme.colors.muted, marginTop: 2 },
  profileEmail: { ...theme.type.body, color: theme.colors.muted, marginTop: 2 },
  profileBadge: { marginTop: theme.spacing.sm },
  aboutText: { ...theme.type.body, color: theme.colors.muted, marginTop: theme.spacing.xs },
  syncCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, marginBottom: theme.spacing.sm },
});

export default App;
