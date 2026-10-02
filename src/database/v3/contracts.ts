export const V3_CONTRACT_VERSION = '3.0' as const;
export const V3_SNAPSHOT_MODE = 'full_snapshot' as const;

export const V3_QUESTION_TYPE_CODES = [
  'multiple_choice',
  'true_false',
  'identification',
  'enumeration',
  'essay',
] as const;
export const V3_CAPTURE_MODES = ['omr', 'hybrid', 'manual'] as const;
export const V3_SCORING_MODES = ['automatic', 'hybrid', 'manual'] as const;
export const V3_PAPER_SIZE_CODES = ['A4', 'US_LETTER', 'US_LEGAL'] as const;
export const V3_ORIENTATIONS = ['portrait', 'landscape'] as const;

export const V3_TEST_ASSIGNMENT_STATUSES = [
  'planned',
  'open',
  'closed',
  'archived',
] as const;
export const V3_SCAN_SESSION_STATUSES = [
  'captured',
  'processing',
  'needs_verification',
  'accepted',
  'rescan_requested',
  'rejected',
  'superseded',
  'failed',
] as const;
export const V3_OMR_DETECTION_STATUSES = [
  'detected',
  'blank',
  'multiple_marks',
  'uncertain',
] as const;
export const V3_STUDENT_ANSWER_STATUSES = [
  'answered',
  'blank',
  'multiple',
  'uncertain',
  'invalid',
  'pending_manual',
] as const;
export const V3_ANSWER_EVALUATION_STATUSES = [
  'pending_verification',
  'needs_manual_scoring',
  'scored',
  'finalized',
] as const;
export const V3_TEST_RESULT_STATUSES = [
  'draft',
  'pending_verification',
  'finalized',
  'superseded',
] as const;
export const V3_SYNC_STATUSES = [
  'pending',
  'in_progress',
  'partial_success',
  'success',
  'failed',
] as const;
export const V3_SYNC_ITEM_STATUSES = [
  'pending',
  'success',
  'failed',
  'skipped',
] as const;
export const V3_CAPTURE_AVAILABILITIES = [
  'planned',
  'scheduled',
  'open',
  'closed',
  'late_allowed',
  'archived',
] as const;

export type V3QuestionTypeCode = (typeof V3_QUESTION_TYPE_CODES)[number];
export type V3CaptureMode = (typeof V3_CAPTURE_MODES)[number];
export type V3ScoringMode = (typeof V3_SCORING_MODES)[number];
export type V3PaperSizeCode = (typeof V3_PAPER_SIZE_CODES)[number];
export type V3Orientation = (typeof V3_ORIENTATIONS)[number];
export type V3TestAssignmentStatus =
  (typeof V3_TEST_ASSIGNMENT_STATUSES)[number];
export type V3ScanSessionStatus = (typeof V3_SCAN_SESSION_STATUSES)[number];
export type V3OmrDetectionStatus = (typeof V3_OMR_DETECTION_STATUSES)[number];
export type V3StudentAnswerStatus = (typeof V3_STUDENT_ANSWER_STATUSES)[number];
export type V3AnswerEvaluationStatus =
  (typeof V3_ANSWER_EVALUATION_STATUSES)[number];
export type V3TestResultStatus = (typeof V3_TEST_RESULT_STATUSES)[number];
export type V3SyncStatus = (typeof V3_SYNC_STATUSES)[number];
export type V3SyncItemStatus = (typeof V3_SYNC_ITEM_STATUSES)[number];
export type V3CaptureAvailability = (typeof V3_CAPTURE_AVAILABILITIES)[number];

export interface V3ApiSuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
  errors: null;
  timestamp: string;
}

export interface V3Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface V3QuestionTypeCapability {
  questionTypeId: number;
  code: V3QuestionTypeCode;
  name: string;
  captureMode: V3CaptureMode;
  scoringMode: V3ScoringMode;
  supportsOmr: boolean;
  supportsOcr: boolean;
  supportsMultipleResponse: boolean;
  requiresAttachment: boolean;
  requiresTeacherVerification: boolean;
  allowsTeacherAnswerEdit: boolean;
}

export interface V3PaperSizeCapability {
  paperSizeId: number;
  code: V3PaperSizeCode;
  name: string;
  widthPt: number;
  heightPt: number;
  operationallySupported: boolean;
}

export interface V3TemplateRegion {
  regionUuid: string;
  regionCode: string;
  regionOrder: number;
  regionType: string;
  questionType: V3QuestionTypeCode | null;
  layoutVariant: string | null;
  responseRegionSize: string | null;
  rectangle: V3Rectangle;
  geometry: unknown;
  geometryHash: string;
  required: boolean;
}

export interface V3OmrTemplateCapability {
  omrTemplateId: number;
  code: string;
  name: string;
  version: string;
  // Null for a mixed-question-type template (dynamic OMR-*-DYNAMIC-CTX-V3 family).
  questionType: V3QuestionTypeCode | null;
  paperSize: V3PaperSizeCode;
  orientation: V3Orientation;
  minimumItemCount: number | null;
  maximumItemCount: number | null;
  optionCount: number | null;
  qrPayloadVersion: number;
  minimumScannerVersion: string;
  coordinateOrigin: string;
  requiredPrintScalePercent: number;
  geometryHash: string;
  physicallyValidated: boolean;
  regions: V3TemplateRegion[];
}

export interface V3SharedStatuses {
  testAssignments: V3TestAssignmentStatus[];
  scanSessions: V3ScanSessionStatus[];
  omrDetections: V3OmrDetectionStatus[];
  studentAnswers: V3StudentAnswerStatus[];
  answerEvaluation: V3AnswerEvaluationStatus[];
  testResults: V3TestResultStatus[];
  syncs: V3SyncStatus[];
  syncItems: V3SyncItemStatus[];
}

export interface V3SyncPolicy {
  syncAction: 'upsert';
  oneAssignmentPerSync: boolean;
  stableUuids: string[];
  identicalRetryStatus: 'replayed';
  changedPayloadConflictCode: 'IDEMPOTENCY_KEY_REUSE';
  scanPageUploadAvailable: boolean;
  scanPageUploadAvailabilityReason: string;
  maximumQrPayloadBytes: number;
  minimumAnswerSheetQuestions: number;
}

export interface V3MobileReferenceData {
  contractVersion: typeof V3_CONTRACT_VERSION;
  serverTime: string;
  downloadMode: typeof V3_SNAPSHOT_MODE;
  questionTypes: V3QuestionTypeCapability[];
  paperSizes: V3PaperSizeCapability[];
  omrTemplates: V3OmrTemplateCapability[];
  statuses: V3SharedStatuses;
  syncPolicy: V3SyncPolicy;
}

export type V3MobileReferenceDataEnvelope =
  V3ApiSuccessEnvelope<V3MobileReferenceData>;

export interface V3Teacher {
  userId: number;
  schoolId: string;
  email: string;
}

export interface V3ClassAssignment {
  classAssignmentId: number;
  classId: number;
  academicYearId: number;
  academicYearName: string;
  gradeLevelId: number;
  gradeLevelName: string;
  sectionId: number;
  sectionName: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  assignmentRole: string;
  status: string;
  classStatus: string;
}

export interface V3ClassAssignmentSchedule {
  classAssignmentScheduleId: number;
  scheduleUuid: string;
  classAssignmentId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezoneName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  scheduleStatus: 'active' | 'archived';
  updatedAt: string;
}

export interface V3ClassListMembership {
  classListId: number;
  membershipUuid: string;
  classId: number;
  studentId: number;
  enrollmentStatus: string;
  enrollmentSource: string;
  enrolledAt: string;
}

export interface V3Student {
  studentId: number;
  studentLrn: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  gender: string | null;
  status: string;
}

export interface V3TermPeriod {
  termPeriodId: number;
  academicYearId: number;
  termName: string;
  termOrder: number;
  startAt: string;
  endAt: string;
  status: string;
}

export interface V3TestAssignment {
  testAssignmentId: number;
  assignmentUuid: string;
  testId: number;
  classAssignmentId: number;
  openAt: string | null;
  closeAt: string | null;
  assignmentStatus: V3TestAssignmentStatus;
  allowLateCapture: boolean;
  captureAllowedNow: boolean;
  captureAvailability: V3CaptureAvailability;
}

export interface V3Test {
  testId: number;
  testUuid: string;
  versionNumber: number;
  termPeriodId: number;
  testName: string;
  testType: string;
  instructions: string | null;
  totalItems: number;
  status: string;
}

export interface V3TestPart {
  testPartId: number;
  testId: number;
  partOrder: number;
  partName: string;
  questionTypeId: number;
  numberOfItems: number;
  pointsPerItem: number;
  instructions: string | null;
}

export interface V3Question {
  questionId: number;
  questionUuid: string;
  testPartId: number;
  questionTypeId: number;
  itemNumber: number;
  globalItemNumber: number;
  questionText: string;
  maximumPoints: number;
  rubricId: number | null;
  responseInstructions: string | null;
  answerOrderRequired: boolean;
  maximumResponseLength: number | null;
  expectedResponseCount: number | null;
  responseRegionSize: string | null;
  forcePageBreakBefore: boolean;
}

export interface V3QuestionOption {
  questionOptionId: number;
  questionId: number;
  optionKey: string;
  optionText: string;
  optionOrder: number;
}

export interface V3PartSkillMapping {
  partSkillMappingId: number;
  testPartId: number;
  skillId: number;
  startItemNumber: number;
  endItemNumber: number;
  itemCount: number;
}

export interface V3Skill {
  skillId: number;
  competencyId: number;
  competencyName: string;
  rootTagId: number;
  rootTagName: string;
  termPeriodId: number;
  gradeLevelId: number;
  subjectId: number;
}

export interface V3AnswerSheetIdentity {
  answerSheetUuid: string;
  testAssignmentId: number;
  assignmentUuid: string;
  paperSize: V3PaperSizeCode;
  generationNumber: number;
  testVersionNumber: number;
  totalQuestions: number;
  totalPages: number;
  manifestVersion: number;
  manifestHash: string;
  requiredScannerVersion: string;
  generatedAt: string;
}

export interface V3MobileDownload {
  contractVersion: typeof V3_CONTRACT_VERSION;
  snapshotMode: typeof V3_SNAPSHOT_MODE;
  generatedAt: string;
  teacher: V3Teacher;
  classAssignments: V3ClassAssignment[];
  classAssignmentSchedules: V3ClassAssignmentSchedule[];
  classLists: V3ClassListMembership[];
  students: V3Student[];
  termPeriods: V3TermPeriod[];
  testAssignments: V3TestAssignment[];
  tests: V3Test[];
  testParts: V3TestPart[];
  questions: V3Question[];
  questionOptions: V3QuestionOption[];
  partSkillMappings: V3PartSkillMapping[];
  skills: V3Skill[];
  answerSheets: V3AnswerSheetIdentity[];
}

export type V3MobileDownloadEnvelope = V3ApiSuccessEnvelope<V3MobileDownload>;

export interface V3ManifestTestAssignmentIdentity {
  testAssignmentId: number;
  assignmentUuid: string;
}

export interface V3ManifestPaperSize {
  code: V3PaperSizeCode;
  widthPt: number;
  heightPt: number;
  orientation: V3Orientation;
}

export interface V3ManifestTemplate {
  code: string;
  version: string;
  geometryHash: string;
}

export interface V3ManifestQr {
  payloadVersion: number;
  payload: string;
  payloadHash: string;
  errorCorrection: string;
}

export interface V3ManifestCoordinateSpace {
  unit: string;
  origin: string;
  width: number;
  height: number;
}

export interface V3ManifestOptionCoordinate {
  key: string;
  storedValue: string;
  centerX: number;
  centerY: number;
}

export interface V3ManifestRegion {
  regionUuid: string;
  templateRegionCode: string;
  questionId: number;
  questionUuid: string;
  testPartId: number;
  globalItemNumber: number;
  partItemNumber: number;
  questionType: V3QuestionTypeCode;
  regionType: string;
  responseRegionSize: string | null;
  expectedResponseCount: number | null;
  responseLineCount: number | null;
  rectangle: V3Rectangle;
  geometryHash: string;
  options: V3ManifestOptionCoordinate[];
}

/**
 * Registration-marker/page-identity geometry for the dynamic (manifestVersion 2)
 * scanner path. Null for the fixed-MC path (manifestVersion 1), which the old
 * scanner already handles without any of this. `geometry` is deliberately opaque
 * (backend: "flexible JsonNode") - only `rectangle`/`regionType`/`regionCode` are
 * relied on until the corner/style encoding for registration markers is confirmed.
 */
export interface V3ManifestTemplateRegion {
  regionUuid: string;
  regionCode: string;
  regionOrder: number;
  regionType: string;
  questionType: string | null;
  layoutVariant: string | null;
  responseRegionSize: string | null;
  rectangle: V3Rectangle;
  geometry: Record<string, unknown> | null;
  geometryHash: string;
  required: boolean;
}

/**
 * Dedicated per-corner marker geometry for the dynamic scanner path - a distinct
 * field from `templateRegions` (which only carries shared/fixed catalog rows).
 * Matches DynamicOmrDetector.kt's registrationMarkers[] one-for-one: `corner` is
 * one of top_left/top_right/bottom_right/bottom_left, `style` is hollow or solid
 * (top_left hollow, the other three solid).
 */
export interface V3ManifestRegistrationMarker {
  markerId: string;
  corner: string;
  style: string;
  rectangle: V3Rectangle;
}

export interface V3ManifestMarkerPattern {
  orientationCorner: string;
  orientationStyle: string;
  locatorStyle: string;
}

export interface V3ManifestPage {
  pageUuid: string;
  pageNumber: number;
  totalPages: number;
  template: V3ManifestTemplate;
  qr: V3ManifestQr;
  coordinateSpace: V3ManifestCoordinateSpace;
  regions: V3ManifestRegion[];
  // The actual per-page, content-derived geometry hash that the printed QR's "gh"
  // field encodes - distinct from `template.geometryHash`, which is the shared/
  // generic template-level hash and does NOT vary per answer sheet. Null on the
  // legacy fixed-template path (see V3AnswerSheetManifestResponse.Page's older
  // constructor overload, which defaults this to null).
  pageGeometryHash: string | null;
  templateRegions: V3ManifestTemplateRegion[];
  registrationMarkers: V3ManifestRegistrationMarker[];
  markerPattern: V3ManifestMarkerPattern;
}

/**
 * Present (non-null) only for a dynamic (manifestVersion 2) answer sheet; null for
 * the fixed-MC path. Corresponds to DynamicOmrDetector.kt's `designSystem.code` /
 * `designSystem.nativePaperGeometry` checks - the scanner requires both to be
 * present and match before trusting a fetched manifest at all.
 */
export interface V3ManifestDesignSystem {
  code: string;
  version: string;
  nativePaperGeometry: boolean;
}

export interface V3AnswerSheetManifest {
  contractVersion: typeof V3_CONTRACT_VERSION;
  manifestVersion: number;
  answerSheetUuid: string;
  testAssignment: V3ManifestTestAssignmentIdentity;
  paperSize: V3ManifestPaperSize;
  testVersionNumber: number;
  totalQuestions: number;
  totalPages: number;
  manifestHash: string;
  requiredScannerVersion: string;
  generatedAt: string;
  designSystem: V3ManifestDesignSystem | null;
  pages: V3ManifestPage[];
}

export type V3AnswerSheetManifestEnvelope =
  V3ApiSuccessEnvelope<V3AnswerSheetManifest>;
