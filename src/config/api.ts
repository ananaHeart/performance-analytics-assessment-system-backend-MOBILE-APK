import { NativeModules, Platform } from 'react-native';

type DeviceTarget = 'auto' | 'cloud' | 'physical' | 'emulator';

// In auto mode, debug builds use the local backend while release builds use cloud.
// A physical debug device reaches localhost through `adb reverse tcp:8080 tcp:8080`.
// An Android emulator reaches the host machine through 10.0.2.2.
// `assembleRelease -PlocalV3Backend=true` explicitly selects local V3 testing.

export const LOCAL_V3_BACKEND_ENABLED =
  NativeModules.V3SecureSession?.localV3Backend === true;

export const CLOUD_BACKEND_BASE_URL = 'https://performance-analytics-assessment-system.onrender.com';

// The V3 backend on Render Free (branch render-free-v3). V3 login, download and
// sync all go here in a cloud build.
export const V3_CLOUD_BACKEND_BASE_URL = 'https://smart-backend-v3.onrender.com';

export const PHYSICAL_DEVICE_BASE_URL = 'http://localhost:8080';
export const DEVICE_TARGET: DeviceTarget = 'auto';

export const ANDROID_EMULATOR_BASE_URL = 'http://10.0.2.2:8080';

const getAndroidConstantText = (key: string): string => {
  const constants = Platform.constants as Record<string, unknown>;
  return String(constants[key] ?? '').toLowerCase();
};

export const isAndroidEmulator = (): boolean => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const deviceText = [
    getAndroidConstantText('Brand'),
    getAndroidConstantText('Manufacturer'),
    getAndroidConstantText('Model'),
    getAndroidConstantText('Product'),
    getAndroidConstantText('Fingerprint'),
  ].join(' ');

  return [
    'emulator',
    'simulator',
    'sdk',
    'sdk_gphone',
    'google_sdk',
    'generic',
    'goldfish',
    'ranchu',
    'genymotion',
  ].some(marker => deviceText.includes(marker));
};

const resolveDeviceTarget = (target: DeviceTarget): Exclude<DeviceTarget, 'auto'> => {
  if (LOCAL_V3_BACKEND_ENABLED) {
    return 'physical';
  }

  // A normal release continues to use the cloud. Local releases must opt in.
  if (!__DEV__) {
    return 'cloud';
  }

  if (target !== 'auto') {
    return target;
  }

  return isAndroidEmulator() ? 'emulator' : 'physical';
};

export const RESOLVED_DEVICE_TARGET = resolveDeviceTarget(DEVICE_TARGET);

// Builds that talk to a V3 backend only (a local release, or the cloud) sign in
// through V3 directly instead of trying the legacy V1/V2 logins first.
export const V3_DIRECT_LOGIN = LOCAL_V3_BACKEND_ENABLED || RESOLVED_DEVICE_TARGET === 'cloud';

// Every V3 call (login, download, scan upload, sync) uses this one URL: the
// Render backend over HTTPS in a cloud build, otherwise the laptop through
// `adb reverse tcp:8080 tcp:8080`.
export const V3_API_BASE_URL =
  !LOCAL_V3_BACKEND_ENABLED && RESOLVED_DEVICE_TARGET === 'cloud'
    ? V3_CLOUD_BACKEND_BASE_URL
    : 'http://127.0.0.1:8080';

export const API_BASE_URL = LOCAL_V3_BACKEND_ENABLED
  ? 'http://127.0.0.1:8080'
  : RESOLVED_DEVICE_TARGET === 'emulator'
    ? ANDROID_EMULATOR_BASE_URL
    : RESOLVED_DEVICE_TARGET === 'physical'
      ? PHYSICAL_DEVICE_BASE_URL
      : CLOUD_BACKEND_BASE_URL;

export const SYNC_DOWNLOAD_PATH = '/api/sync/download';
export const SYNC_UPLOAD_PATH = '/api/sync/upload';

export const getSyncDownloadUrl = (teacherId: number | string): string =>
  `${API_BASE_URL}${SYNC_DOWNLOAD_PATH}/${teacherId}`;

export const getSyncUploadUrl = (): string =>
  `${API_BASE_URL}${SYNC_UPLOAD_PATH}`;
