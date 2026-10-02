import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { LoginScreen } from '../src/components/LoginScreen';
import { V3LoginFlow } from '../src/components/V3LoginFlow';
import { loginTeacher, loginV2Teacher } from '../src/services/authService';
import { defaultV3DiagnosticsConnection } from '../src/services/v3/diagnosticsConnection';

jest.mock('../src/config/api', () => ({ LOCAL_V3_BACKEND_ENABLED: true, V3_DIRECT_LOGIN: true }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('lucide-react-native', () => {
  const icons: Record<string, () => null> = {};
  for (const name of ['AlertCircle', 'BookOpen', 'ChevronDown', 'CheckCircle2', 'Home',
    'Mail', 'RefreshCw', 'Save', 'ScanLine', 'School', 'UserCircle', 'X']) {
    icons[name] = () => null;
  }
  return icons;
});
jest.mock('../src/database/db', () => ({
  initDatabase: jest.fn(),
  getLocalDataCounts: jest.fn(() => ({ classes: 0, students: 0, tests: 0, testParts: 0 })),
  collectUnsyncedResults: jest.fn(() => ({ success: true, payload: {} })),
}));
jest.mock('../src/database/v2/database', () => ({
  initV2Database: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/database/v2/contextRepository', () => ({}));
jest.mock('../src/database/v2/analyticsRepository', () => ({}));
jest.mock('../src/database/v2/syncRepository', () => ({}));
jest.mock('../src/database/v3/database', () => ({
  initV3Database: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/database/v3/diagnosticRepository', () => ({}));
jest.mock('../src/database/v3/objectiveRepository', () => ({}));
jest.mock('../src/services/authService', () => ({
  loginTeacher: jest.fn(), loginV2Teacher: jest.fn(),
}));
jest.mock('../src/services/v2SyncService', () => ({}));
jest.mock('../src/services/v3/diagnosticsConnection', () => ({
  V3_LOCAL_STAGING_BASE_URL: 'http://127.0.0.1:8080',
  V3_BASE_URL: 'http://127.0.0.1:8080',
  defaultV3DiagnosticsConnection: { restore: jest.fn() },
}));
jest.mock('../src/components/LoginScreen', () => ({ LoginScreen: () => null }));
jest.mock('../src/components/NavigationLists', () => ({ ClassList: () => null, TestList: () => null }));
jest.mock('../src/components/CheckingGrid', () => ({ CheckingGrid: () => null }));
jest.mock('../src/components/AnalyticsView', () => ({ AnalyticsView: () => null }));
jest.mock('../src/components/OmrScannerModal', () => ({ OmrScannerModal: () => null }));
jest.mock('../src/components/V3ObjectiveWorkflowModal', () => ({ V3ObjectiveWorkflowModal: () => null }));
jest.mock('../src/prototypes/v3DynamicOmrScanner/DynamicOmrScannerPrototype', () => ({
  DynamicOmrScannerPrototype: () => null,
}));
jest.mock('../src/components/V3LoginFlow', () => ({
  V3LoginFlow: () => null,
}));

describe('standalone local release login', () => {
  const originalDev = __DEV__;
  const restore = jest.mocked(defaultV3DiagnosticsConnection.restore);
  let renderer: ReactTestRenderer.ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    restore.mockResolvedValue({ kind: 'none' });
  });

  afterEach(async () => {
    if (renderer) {
      await ReactTestRenderer.act(async () => { renderer.unmount(); });
    }
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
  });

  test('attempts secure restoration even when development mode is disabled', async () => {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  });

  test('opens the V3 login/MFA flow directly without legacy credential requests', async () => {
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByType(LoginScreen).props.onLogin('teacher@example.com', 'test-password');
    });
    const v3Screen = renderer.root.findByType(V3LoginFlow);
    expect(v3Screen.props.request).toMatchObject({
      email: 'teacher@example.com', password: 'test-password',
    });
    expect(loginTeacher).not.toHaveBeenCalled();
    expect(loginV2Teacher).not.toHaveBeenCalled();
  });

  test('an expired stored session stays on the login screen', async () => {
    restore.mockResolvedValue({
      kind: 'expired', backendUrl: 'http://127.0.0.1:8080', email: 'teacher@example.com',
    });
    await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
    expect(renderer.root.findAllByType(V3LoginFlow)).toHaveLength(0);
  });
});
