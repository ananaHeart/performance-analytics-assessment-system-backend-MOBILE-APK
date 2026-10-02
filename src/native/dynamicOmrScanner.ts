import {NativeModules, Platform} from 'react-native';

export type DynamicQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'identification'
  | 'enumeration'
  | 'essay';

export type DynamicDetectionStatus =
  | 'detected'
  | 'blank'
  | 'multiple_marks'
  | 'uncertain';

export interface DynamicOmrIdentity {
  payloadVersion: number;
  answerSheetUuid: string;
  pageUuid: string;
  assignmentUuid: string;
  pageNumber: number;
  totalPages: number;
  templateCode: string;
  templateVersion: string;
  geometryHash: string;
}

export interface DynamicMarkerCheck {
  corner: 'top_left' | 'top_right' | 'bottom_right' | 'bottom_left';
  style: 'hollow' | 'solid';
  centerDarkness: number;
}

export interface DynamicObjectiveDetection {
  regionUuid: string;
  questionId: number;
  questionUuid: string;
  itemNumber: number;
  questionType: 'multiple_choice' | 'true_false';
  detectedOption: string | null;
  detectedLabel: string | null;
  confidenceScore: number;
  detectionStatus: DynamicDetectionStatus;
  verificationStatus: 'pending';
  teacherMayReplaceAnswer: false;
  rawMarkInformation: {
    markedOptions: string[];
    optionScores: Record<string, number>;
    scoreGap: number;
  };
}

export interface DynamicWrittenEvidence {
  regionUuid: string;
  questionId: number;
  questionUuid: string;
  itemNumber: number;
  questionType: 'identification' | 'enumeration' | 'essay';
  evidenceImageUri: string;
  evidenceSha256: string;
  enhancedImageUri: string;
  enhancementMethod: 'illumination_normalization_clahe_unsharp';
  evidenceStatus: 'captured';
  evaluationStatus: 'needs_manual_scoring';
  teacherMayReplaceResponse: false;
}

export interface DynamicScanQuality {
  focusScore: number;
  meanBrightness: number;
  shadowPercent: number;
  highlightPercent: number;
  illuminationRange: number;
  pageCoveragePercent: number;
  perspectiveSkewPercent: number;
  warnings: string[];
}

export interface DynamicScanTimings {
  qrDecodeMs: number;
  alignmentMs: number;
  analysisMs: number;
  totalMs: number;
}

export interface DynamicOmrScanResult {
  scannerVersion: string;
  manifestHash: string;
  paperSize: 'A4' | 'US_LETTER' | 'US_LEGAL';
  sourceImageUri: string;
  alignedImageUri: string;
  annotatedImageUri: string;
  originalPageSha256: string;
  // The downscaled copy that is uploaded as the page image; uploadImageSha256
  // covers exactly its bytes. Absent from scans made by an older native build,
  // which upload the full capture instead.
  uploadImageUri?: string;
  uploadImageSha256?: string;
  uploadImageWidthPx?: number;
  uploadImageHeightPx?: number;
  alignmentMethod: string;
  inputRotationDegreesClockwise: number;
  teacherVerificationRequired: true;
  finalStudentAnswersGenerated: false;
  identity: DynamicOmrIdentity;
  markerChecks: DynamicMarkerCheck[];
  objectiveDetections: DynamicObjectiveDetection[];
  writtenEvidence: DynamicWrittenEvidence[];
  quality: DynamicScanQuality;
  timings: DynamicScanTimings;
}

export interface DynamicOmrScanOptions {
  expectedAnswerSheetUuid?: string;
  expectedAssignmentUuid?: string;
  /**
   * Raw manifest JSON text fetched from the backend for a specific assignment/
   * answer-sheet (see src/services/v3/mobileReadClient.ts and
   * src/database/v3/manifestRepository.ts). When supplied, the native scanner parses
   * and validates against this manifest directly instead of looking up one of the 3
   * bundled asset files by the QR's template code — so scanning is no longer limited
   * to those 3 fixed reference sheets. The existing QR/geometry-hash
   * self-consistency check still applies unchanged: a fetched manifest that doesn't
   * match the physically scanned page is still rejected, not silently trusted.
   */
  manifestJson?: string;
}

interface DynamicOmrScannerNativeModule {
  captureDynamicAndDetect(options: DynamicOmrScanOptions): Promise<DynamicOmrScanResult>;
  chooseDynamicAndDetect(options: DynamicOmrScanOptions): Promise<DynamicOmrScanResult>;
}

const getNativeScanner = (): DynamicOmrScannerNativeModule => {
  if (Platform.OS !== 'android') {
    throw new Error('The dynamic OMR test scanner currently supports Android only.');
  }

  const scanner = NativeModules.OmrScanner as
    | DynamicOmrScannerNativeModule
    | undefined;
  if (!scanner?.captureDynamicAndDetect || !scanner?.chooseDynamicAndDetect) {
    throw new Error('The dynamic Android scanner is not installed in this build.');
  }
  return scanner;
};

export const captureDynamicOmrSheet = (
  options: DynamicOmrScanOptions = {},
): Promise<DynamicOmrScanResult> =>
  getNativeScanner().captureDynamicAndDetect(options);

export const chooseDynamicOmrImage = (
  options: DynamicOmrScanOptions = {},
): Promise<DynamicOmrScanResult> =>
  getNativeScanner().chooseDynamicAndDetect(options);
