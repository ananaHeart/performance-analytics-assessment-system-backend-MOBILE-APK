describe('APK backend selection', () => {
  const originalDev = __DEV__;

  const loadConfig = (development: boolean, localV3Backend?: unknown) => {
    jest.resetModules();
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = development;
    jest.doMock('react-native', () => ({
      NativeModules: {
        V3SecureSession: localV3Backend === undefined ? undefined : { localV3Backend },
      },
      Platform: { OS: 'android', constants: { Model: 'Physical phone' } },
    }));
    return require('../src/config/api') as typeof import('../src/config/api');
  };

  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
    jest.dontMock('react-native');
    jest.resetModules();
  });

  test('opted-in release uses the local V3 backend without Metro development mode', () => {
    const config = loadConfig(false, true);
    expect(config.LOCAL_V3_BACKEND_ENABLED).toBe(true);
    expect(config.API_BASE_URL).toBe('http://127.0.0.1:8080');
  });

  test('ordinary release retains the cloud backend', () => {
    const config = loadConfig(false, false);
    expect(config.LOCAL_V3_BACKEND_ENABLED).toBe(false);
    expect(config.API_BASE_URL).toBe(config.CLOUD_BACKEND_BASE_URL);
  });

  test('an older native build without the flag retains the release default', () => {
    const config = loadConfig(false);
    expect(config.LOCAL_V3_BACKEND_ENABLED).toBe(false);
    expect(config.API_BASE_URL).toBe(config.CLOUD_BACKEND_BASE_URL);
  });

  test('a string flag cannot accidentally enable local release mode', () => {
    const config = loadConfig(false, 'true');
    expect(config.LOCAL_V3_BACKEND_ENABLED).toBe(false);
    expect(config.API_BASE_URL).toBe(config.CLOUD_BACKEND_BASE_URL);
  });

  test('existing debug builds retain the physical-device backend', () => {
    const config = loadConfig(true, false);
    expect(config.API_BASE_URL).toBe('http://localhost:8080');
  });
});
