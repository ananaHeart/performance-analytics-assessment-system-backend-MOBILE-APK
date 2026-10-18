import {DeviceEventEmitter} from 'react-native';

// Sent by OmrScannerModule once the photo is saved and detection starts.
const SCAN_PHOTO_READY_EVENT = 'OmrScanPhotoReady';

/** Calls `listener` with the photo's file:// URI; returns an unsubscribe function. */
export const subscribeScanPhotoReady = (listener: (uri: string) => void): (() => void) => {
  const subscription = DeviceEventEmitter.addListener(
    SCAN_PHOTO_READY_EVENT,
    (event: {uri?: unknown} | null) => {
      if (typeof event?.uri === 'string') listener(event.uri);
    },
  );
  return () => subscription.remove();
};
