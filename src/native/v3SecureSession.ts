import { NativeModules, Platform } from 'react-native';

interface V3SecureSessionNativeModule {
  save(value: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}

export interface V3SecureSessionStore {
  save(value: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}

const getNativeModule = (): V3SecureSessionNativeModule => {
  if (Platform.OS !== 'android') {
    throw new Error('Secure V3 session persistence currently supports Android only.');
  }
  const secureSession = NativeModules.V3SecureSession as
    | V3SecureSessionNativeModule
    | undefined;
  if (!secureSession?.save || !secureSession?.load || !secureSession?.clear) {
    throw new Error('The Android V3 secure-session module is unavailable.');
  }
  return secureSession;
};

export const nativeV3SecureSessionStore: V3SecureSessionStore = Object.freeze({
  save: (value: string) => getNativeModule().save(value),
  load: () => getNativeModule().load(),
  clear: () => getNativeModule().clear(),
});

export interface V3LocalCipher {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

interface V3LocalCipherNativeModule {
  encryptText?: (value: string) => Promise<string>;
  decryptText?: (value: string) => Promise<string>;
}

/**
 * Android Keystore encryption for local data, or null when the installed
 * native build predates encryptText/decryptText - callers must then avoid
 * storing anything that needs protecting.
 */
export const getV3LocalCipher = (): V3LocalCipher | null => {
  if (Platform.OS !== 'android') return null;
  const nativeModule = NativeModules.V3SecureSession as V3LocalCipherNativeModule | undefined;
  const encryptText = nativeModule?.encryptText;
  const decryptText = nativeModule?.decryptText;
  if (!encryptText || !decryptText) return null;
  return {
    encrypt: value => encryptText(value),
    decrypt: value => decryptText(value),
  };
};
