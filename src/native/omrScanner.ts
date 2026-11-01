import {NativeModules, Platform} from 'react-native';

import type {
  AnswerOption,
  DetectionStatus,
  RawMarkInformation,
  VerificationStatus,
} from '../database/v2/contracts';

export interface OmrSheetIdentity {
  payloadVersion: string;
  templateVersion: string;
  questionType: string;
  itemCount: number;
  testId?: number;
}

export interface OmrScanDetection {
  itemNumber: number;
  detectedOption: AnswerOption | null;
  confidenceScore: number;
  detectionStatus: DetectionStatus;
  verificationStatus: VerificationStatus;
  detectedAt: string;
  rawMarkInformation: RawMarkInformation;
}

export interface OmrScanResult {
  scannerVersion: string;
  templateVersion: string;
  questionType: string;
  itemCount: number;
  sourceImageUri: string;
  alignedImageUri: string;
  annotatedImageUri: string;
  imageHash: string;
  alignmentMethod: string;
  teacherVerificationRequired: true;
  sheetIdentity: OmrSheetIdentity;
  detections: OmrScanDetection[];
}

export interface OmrScanOptions {
  expectedTemplateVersion: string;
  expectedItemCount: number;
  expectedTestId?: number;
}

interface OmrScannerNativeModule {
  captureAndDetect(options: OmrScanOptions): Promise<OmrScanResult>;
  chooseAndDetect(options: OmrScanOptions): Promise<OmrScanResult>;
  getFileSize(uri: string): Promise<number>;
  listDynamicScanFiles(): Promise<{uri: string; bytes: number}[]>;
  deleteDynamicScanFiles(uris: string[]): Promise<number>;
}

const getNativeScanner = (): OmrScannerNativeModule => {
  if (Platform.OS !== 'android') {
    throw new Error('The fixed-template OMR scanner currently supports Android only.');
  }

  const scanner = NativeModules.OmrScanner as OmrScannerNativeModule | undefined;
  if (!scanner) {
    throw new Error('The Android OMR scanner is not installed in this build. Rebuild the app.');
  }

  return scanner;
};

export const captureOmrSheet = (options: OmrScanOptions): Promise<OmrScanResult> =>
  getNativeScanner().captureAndDetect(options);

export const chooseOmrImage = (options: OmrScanOptions): Promise<OmrScanResult> =>
  getNativeScanner().chooseAndDetect(options);

export const getLocalFileSize = (uri: string): Promise<number> =>
  getNativeScanner().getFileSize(uri);

/** Dynamic scan folders and raw photos on the phone, with their sizes. */
export const listDynamicScanFiles = (): Promise<{uri: string; bytes: number}[]> =>
  getNativeScanner().listDynamicScanFiles();

/** Deletes the dynamic scan folder (or raw photo) of each URI; resolves with bytes freed. */
export const deleteDynamicScanFiles = (uris: string[]): Promise<number> =>
  getNativeScanner().deleteDynamicScanFiles(uris);
