import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type { V3OfflineDiagnosticSnapshot } from '../src/database/v3/diagnosticRepository';
import { V3OfflineDiagnosticsScreen } from '../src/prototypes/v3OfflineDiagnostics/V3OfflineDiagnosticsScreen';
import type { V3AuthSession } from '../src/services/v3/authClient';
import type { V3DiagnosticsConnectionAdapter } from '../src/services/v3/diagnosticsConnection';

jest.mock('../src/database/v3/database', () => ({
  initV3Database: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/database/v3/diagnosticRepository', () => ({
  getV3OfflineDiagnosticSnapshot: jest.fn(),
}));

const READY_SNAPSHOT: V3OfflineDiagnosticSnapshot = {
  status: 'ready',
  schemaVersion: 3,
  referenceData: {
    serverTime: '2026-09-07T08:00:00Z',
    refreshedAt: '2026-09-07T08:01:00Z',
    payloadHash: 'a'.repeat(64),
  },
  activeSnapshot: {
    snapshotUuid: '00000000-0000-5000-8000-000000000009',
    generatedAt: '2026-09-07T08:00:00Z',
    downloadedAt: '2026-09-07T08:01:00Z',
    committedAt: '2026-09-07T08:01:01Z',
    teacherEmail: 'teacher@example.com',
    schoolId: 'SCHOOL-001',
  },
  counts: {
    classes: 1,
    classAssignments: 1,
    classLists: 27,
    students: 27,
    tests: 1,
    testAssignments: 1,
    testParts: 2,
    questions: 10,
    answerSheets: 1,
    readyManifests: 1,
  },
  classes: [
    {
      classAssignmentId: 200,
      classId: 300,
      gradeLevelName: 'Grade 7',
      sectionName: 'Rizal',
      className: 'Grade 7 - Rizal',
      subjectName: 'English',
      assignmentStatus: 'active',
      studentCount: 27,
      assessmentCount: 1,
    },
  ],
  assessments: [
    {
      testAssignmentId: 12001,
      testId: 1006,
      classAssignmentId: 200,
      classId: 300,
      assignmentUuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
      testName: 'English Quiz 2',
      className: 'Grade 7 - Rizal',
      subjectName: 'English',
      termName: 'First Quarter',
      assignmentStatus: 'open',
      captureAvailability: 'open',
      closeAt: '2026-09-08T08:00:00Z',
      totalItems: 10,
      answerSheetCount: 1,
    },
  ],
  answerSheets: [
    {
      answerSheetUuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
      assignmentUuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb',
      testName: 'English Quiz 2',
      paperSize: 'A4',
      totalPages: 1,
      downloadedPages: 1,
      totalQuestions: 10,
      downloadedRegions: 10,
      manifestReady: true,
      requiredScannerVersion: '2.0.0',
    },
  ],
  issues: [],
};

const SESSION: V3AuthSession = {
  tokenType: 'Bearer',
  accessToken: 'raw-v3-session-token',
  expiresAt: '2026-09-07T16:00:00Z',
  user: {
    userId: 920001,
    schoolId: 'SCHOOL-001',
    firstName: 'Maria',
    middleName: null,
    lastName: 'Reyes',
    suffix: null,
    email: 'teacher@example.com',
    role: 'teacher',
    status: 'active',
    mfaRequired: false,
  },
};

const noSessionAdapter = (): jest.Mocked<V3DiagnosticsConnectionAdapter> => ({
  restore: jest.fn().mockResolvedValue({ kind: 'none' }),
  clearSession: jest.fn().mockResolvedValue(undefined),
  login: jest.fn(),
  verifyMfa: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
});

describe('V3OfflineDiagnosticsScreen', () => {
  test('renders active snapshot data and refreshes on demand', async () => {
    const loadSnapshot = jest.fn().mockResolvedValue(READY_SNAPSHOT);
    const connectionAdapter = noSessionAdapter();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <V3OfflineDiagnosticsScreen
          visible
          onClose={jest.fn()}
          loadSnapshot={loadSnapshot}
          connectionAdapter={connectionAdapter}
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const root = renderer!.root;
    const text = root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter(value => typeof value === 'string');
    expect(text).toEqual(
      expect.arrayContaining([
        'V3 Data Diagnostics',
        'Local V3 data ready',
        'Grade 7 - Rizal',
        'English Quiz 2',
        'Ready',
      ]),
    );
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      await root
        .findByProps({ accessibilityLabel: 'Refresh V3 diagnostics' })
        .props.onPress();
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  }, 30000);

  test('does not initialize while the diagnostic modal is closed', async () => {
    const loadSnapshot = jest.fn().mockResolvedValue(READY_SNAPSHOT);
    const connectionAdapter = noSessionAdapter();

    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <V3OfflineDiagnosticsScreen
          visible={false}
          onClose={jest.fn()}
          loadSnapshot={loadSnapshot}
          connectionAdapter={connectionAdapter}
        />,
      );
    });

    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  test('authenticates a teacher and refreshes the isolated V3 database', async () => {
    const loadSnapshot = jest.fn().mockResolvedValue(READY_SNAPSHOT);
    const connectionAdapter = {
      restore: jest.fn().mockResolvedValue({ kind: 'none' }),
      clearSession: jest.fn().mockResolvedValue(undefined),
      login: jest.fn().mockResolvedValue({
        kind: 'authenticated',
        session: SESSION,
      }),
      verifyMfa: jest.fn(),
      refresh: jest.fn().mockResolvedValue(READY_SNAPSHOT),
      logout: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<V3DiagnosticsConnectionAdapter>;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <V3OfflineDiagnosticsScreen
          visible
          onClose={jest.fn()}
          loadSnapshot={loadSnapshot}
          connectionAdapter={connectionAdapter}
          defaultBaseUrl="http://localhost:8080"
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const root = renderer!.root;
    ReactTestRenderer.act(() => {
      root.findByProps({ accessibilityLabel: 'V3 teacher email' }).props.onChangeText(
        'teacher@example.com',
      );
      root.findByProps({ accessibilityLabel: 'V3 teacher password' }).props.onChangeText(
        'StrongPass1!',
      );
    });
    await ReactTestRenderer.act(async () => {
      await root
        .findByProps({ accessibilityLabel: 'Connect and download V3 data' })
        .props.onPress();
    });

    expect(connectionAdapter.login).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8080',
      email: 'teacher@example.com',
      password: 'StrongPass1!',
    });
    expect(connectionAdapter.refresh).toHaveBeenCalledWith(
      'http://localhost:8080',
      SESSION,
    );
    expect(
      root
        .findAllByType(Text)
        .some(node => node.props.children === 'V3 session connected'),
    ).toBe(true);
  });

  test('hands an authenticated V3 session and downloaded snapshot to the app', async () => {
    const connectionAdapter = noSessionAdapter();
    const onAuthenticated = jest.fn();
    connectionAdapter.login.mockResolvedValue({
      kind: 'authenticated',
      session: SESSION,
    });
    connectionAdapter.refresh.mockResolvedValue(READY_SNAPSHOT);

    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <V3OfflineDiagnosticsScreen
          visible
          onClose={jest.fn()}
          onAuthenticated={onAuthenticated}
          loadSnapshot={jest.fn().mockResolvedValue(READY_SNAPSHOT)}
          connectionAdapter={connectionAdapter}
          defaultBaseUrl="http://127.0.0.1:8080"
          initialLoginRequest={{
            requestId: 2,
            email: 'teacher@example.com',
            password: 'StrongPass1!',
          }}
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAuthenticated).toHaveBeenCalledWith(SESSION, READY_SNAPSHOT);
  });

  test('routes supplied credentials into the V3 MFA flow without restoring first', async () => {
    const connectionAdapter = noSessionAdapter();
    connectionAdapter.login.mockResolvedValue({
      kind: 'mfa_required',
      challenge: {
        challengeUuid: '00000000-0000-5000-8000-000000000099',
        expiresAt: '2026-09-07T08:05:00Z',
        maximumAttempts: 5,
        verificationMethods: ['authenticator'],
        emailMasked: 't***@example.com',
      },
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <V3OfflineDiagnosticsScreen
          visible
          onClose={jest.fn()}
          loadSnapshot={jest.fn().mockResolvedValue(READY_SNAPSHOT)}
          connectionAdapter={connectionAdapter}
          defaultBaseUrl="http://127.0.0.1:8080"
          initialLoginRequest={{
            requestId: 1,
            email: 'teacher@example.com',
            password: 'StrongPass1!',
          }}
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(connectionAdapter.restore).not.toHaveBeenCalled();
    expect(connectionAdapter.login).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:8080',
      email: 'teacher@example.com',
      password: 'StrongPass1!',
    });
    expect(
      renderer!.root
        .findAllByType(Text)
        .some(
          node =>
            node.props.children ===
            'Password accepted. Complete authenticator verification.',
        ),
    ).toBe(true);
  });

  test('restores a protected session after /me verification', async () => {
    const connectionAdapter = noSessionAdapter();
    connectionAdapter.restore.mockResolvedValue({
      kind: 'restored',
      backendUrl: 'http://127.0.0.1:8080',
      session: SESSION,
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <V3OfflineDiagnosticsScreen
          visible
          onClose={jest.fn()}
          loadSnapshot={jest.fn().mockResolvedValue(READY_SNAPSHOT)}
          connectionAdapter={connectionAdapter}
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(connectionAdapter.restore).toHaveBeenCalledTimes(1);
    expect(
      renderer!.root
        .findAllByType(Text)
        .some(node => node.props.children === 'V3 session connected'),
    ).toBe(true);
    expect(
      renderer!.root
        .findAllByType(Text)
        .some(
          node =>
            node.props.children ===
            'Secure V3 session restored and verified with /me.',
        ),
    ).toBe(true);
  });
});
