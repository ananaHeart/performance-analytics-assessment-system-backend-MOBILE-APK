import type { V3SecureSessionStore } from '../src/native/v3SecureSession';
import type { V3AuthSession } from '../src/services/v3/authClient';
import {
  V3SessionReauthenticationError,
  createV3SecureSessionService,
} from '../src/services/v3/secureSessionService';

const NOW = new Date('2026-09-14T03:00:00Z');
const SESSION: V3AuthSession = {
  tokenType: 'Bearer',
  accessToken: 'secret-v3-bearer-token',
  expiresAt: '2026-09-14T11:00:00Z',
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

const createStore = (initialValue: string | null = null) => {
  let value = initialValue;
  const store: jest.Mocked<V3SecureSessionStore> = {
    save: jest.fn(async nextValue => {
      value = nextValue;
    }),
    load: jest.fn(async () => value),
    clear: jest.fn(async () => {
      value = null;
    }),
  };
  return { store, read: () => value };
};

describe('V3 secure session lifecycle', () => {
  test('persists the session with its backend and owner identity', async () => {
    const { store, read } = createStore();
    const service = createV3SecureSessionService({ store, now: () => NOW });

    await service.save('http://127.0.0.1:18082/', SESSION);

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(read()!)).toMatchObject({
      storageVersion: 1,
      backendUrl: 'http://127.0.0.1:18082',
      savedAt: NOW.toISOString(),
      session: {
        accessToken: SESSION.accessToken,
        expiresAt: SESSION.expiresAt,
        user: { userId: 920001, schoolId: 'SCHOOL-001' },
      },
    });
  });

  // restore() trusts the stored token as-is (checking only its own known
  // expiry) rather than making a live /me call on every restore - a network
  // hiccup during that call used to silently downgrade a perfectly valid
  // session into "offline"/"reauthentication_required" on every single app
  // launch. If a token really has been revoked, the first real API call
  // 401s and rethrowProtectedError() clears it then instead.
  test('restores an unexpired session without a live re-validation call', async () => {
    const { store } = createStore();
    const service = createV3SecureSessionService({ store, now: () => NOW });
    await service.save('http://127.0.0.1:18082', SESSION);

    await expect(service.restore()).resolves.toEqual({
      kind: 'restored',
      backendUrl: 'http://127.0.0.1:18082',
      session: SESSION,
    });
    expect(store.clear).not.toHaveBeenCalled();
  });

  test('clears an expired session', async () => {
    const { store } = createStore();
    const service = createV3SecureSessionService({
      store,
      now: () => new Date('2026-09-14T12:00:00Z'),
    });
    const record = JSON.stringify({
      storageVersion: 1,
      backendUrl: 'http://127.0.0.1:18082',
      savedAt: NOW.toISOString(),
      session: SESSION,
    });
    store.load.mockResolvedValue(record);

    await expect(service.restore()).resolves.toMatchObject({ kind: 'expired' });
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  test('clears a protected credential after HTTP 401', async () => {
    const { store } = createStore('protected-record');
    const service = createV3SecureSessionService({ store, now: () => NOW });

    const request = service.rethrowProtectedError({ status: 401 });
    await expect(request).rejects.toMatchObject({ code: 'HTTP_401' });
    await request.catch(error =>
      expect(error).toBeInstanceOf(V3SessionReauthenticationError),
    );
    expect(store.clear).toHaveBeenCalledTimes(1);
  });
});
