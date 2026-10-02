export const V2_CONTRACT_VERSION = '2.0' as const;
export const V2_DATABASE_NAME = 'AssessmentStorageV2.db' as const;
export const V2_MC_TEMPLATE_VERSION = 'OMR-A4-10-MC-CTX-V2' as const;

export const SCAN_STATUSES = [
  'captured',
  'processing',
  'needs_verification',
  'verified',
  'failed',
] as const;
export const DETECTION_STATUSES = [
  'detected',
  'blank',
  'multiple_marks',
  'uncertain',
] as const;
export const VERIFICATION_STATUSES = ['pending', 'confirmed', 'corrected'] as const;
export const ANSWER_STATUSES = ['answered', 'blank', 'multiple', 'invalid'] as const;
export const CAPTURE_SOURCES = ['omr', 'teacher_correction', 'manual'] as const;
export const LINK_STATUSES = ['selected', 'superseded', 'rejected'] as const;
export const BATCH_SYNC_STATUSES = [
  'pending',
  'in_progress',
  'partial_success',
  'success',
  'failed',
] as const;
export const ITEM_SYNC_STATUSES = ['pending', 'success', 'failed', 'skipped'] as const;
export const SYNC_ACTIONS = ['create', 'update'] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];
export type DetectionStatus = (typeof DETECTION_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];
export type LinkStatus = (typeof LINK_STATUSES)[number];
export type BatchSyncStatus = (typeof BATCH_SYNC_STATUSES)[number];
export type ItemSyncStatus = (typeof ITEM_SYNC_STATUSES)[number];
export type SyncAction = (typeof SYNC_ACTIONS)[number];
export type AnswerOption = 'A' | 'B' | 'C' | 'D' | 'E';

export interface V2SyncUser {
  userId: number;
  schoolId: string;
  email: string;
  role: string;
  status: string;
}

export interface V2SyncClassAssignment {
  classAssignmentId: number;
  classId: number;
  academicYearId: number;
  yearName: string;
  gradeLevelId: number;
  gradeLevelName: string;
  sectionId: number;
  sectionName: string;
  subjectId: number;
  subjectName: string;
  assignmentRole: string;
  assignmentStatus: string;
}

export interface V2SyncClass {
  classId: number;
  academicYearId: number;
  yearName: string;
  gradeLevelId: number;
  gradeLevelName: string;
  sectionId: number;
  sectionName: string;
  status: string;
}

export interface V2SyncClassList {
  classListId: number;
  classId: number;
  studentId: number;
}

export interface V2SyncStudent {
  studentId: number;
  schoolId: string;
  studentLrn: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  status: string;
}

export interface V2SyncTest {
  testId: number;
  classAssignmentId: number;
  termPeriodId: number;
  termName: string;
  testName: string;
  testType: string;
  testDate: string;
  instructions: string | null;
  totalItems: number;
  status: string;
}

export interface V2SyncTestPart {
  testPartId: number;
  testId: number;
  partOrder: number;
  partName: string;
  partType: string;
  numberOfItems: number;
  pointsPerItem: number;
}

export interface V2SyncQuestion {
  questionId: number;
  testPartId: number;
  itemNumber: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string | null;
}

export interface V2SyncAnswerKey {
  questionId: number;
  correctOption: AnswerOption;
}

export interface V2SyncSkill {
  skillId: number;
  competencyId: number;
  competencyName: string;
  rootTagId: number;
  rootTagName: string;
  termPeriodId: number;
  gradeLevelId: number;
  subjectId: number;
}

export interface V2SyncQuestionMapping {
  questionId: number;
  skillId: number;
}

export interface V2DownloadPayload {
  contractVersion: string;
  generatedAt: string;
  user: V2SyncUser;
  classAssignments: V2SyncClassAssignment[];
  classes: V2SyncClass[];
  classLists: V2SyncClassList[];
  students: V2SyncStudent[];
  tests: V2SyncTest[];
  testParts: V2SyncTestPart[];
  questions: V2SyncQuestion[];
  answerKeys: V2SyncAnswerKey[];
  skills: V2SyncSkill[];
  questionMappings: V2SyncQuestionMapping[];
}

export interface RawMarkInformation {
  markedOptions?: AnswerOption[];
  optionScores?: Partial<Record<AnswerOption, number>>;
  scoreGap?: number;
  [key: string]: unknown;
}

export interface V2DetectionUpload {
  questionId: number;
  itemNumber: number;
  detectedOption: AnswerOption | null;
  confidenceScore: number;
  detectionStatus: DetectionStatus;
  verificationStatus: VerificationStatus;
  rawMarkInformation: RawMarkInformation;
  detectedAt: string;
}

export interface V2AnswerUpload {
  answerUuid: string;
  questionId: number;
  selectedOption: AnswerOption | null;
  answerStatus: AnswerStatus;
  captureSource: CaptureSource;
  verifiedAt: string;
  correctionReason: string | null;
}

export interface V2ScanSessionUpload {
  scanUuid: string;
  templateVersion: string;
  scannerVersion: string;
  imageHash: string | null;
  scanStatus: 'verified';
  scannedAt: string;
  verifiedAt: string;
  detections: V2DetectionUpload[];
}

export interface V2ResultUpload {
  resultUuid: string;
  syncAction: SyncAction;
  classListId: number;
  attemptNumber: number;
  checkedAt: string;
  scanSession: V2ScanSessionUpload | null;
  answers: V2AnswerUpload[];
}

export interface V2UploadPayload {
  contractVersion: typeof V2_CONTRACT_VERSION;
  syncUuid: string;
  deviceIdentifier: string;
  uploadedAt: string;
  testId: number;
  results: V2ResultUpload[];
}

export interface V2UploadResponseItem {
  resultUuid: string;
  syncItemId: number | null;
  testResultId: number | null;
  scanSessionId: number | null;
  status: ItemSyncStatus;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface V2UploadResponse {
  syncUuid: string;
  syncId: number;
  testId: number;
  status: BatchSyncStatus;
  completedAt: string;
  items: V2UploadResponseItem[];
}
