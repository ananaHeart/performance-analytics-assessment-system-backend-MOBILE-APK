import {
  V3_ANSWER_EVALUATION_STATUSES,
  V3_CAPTURE_AVAILABILITIES,
  V3_CAPTURE_MODES,
  V3_CONTRACT_VERSION,
  V3_OMR_DETECTION_STATUSES,
  V3_ORIENTATIONS,
  V3_PAPER_SIZE_CODES,
  V3_QUESTION_TYPE_CODES,
  V3_SCAN_SESSION_STATUSES,
  V3_SCORING_MODES,
  V3_SNAPSHOT_MODE,
  V3_STUDENT_ANSWER_STATUSES,
  V3_SYNC_ITEM_STATUSES,
  V3_SYNC_STATUSES,
  V3_TEST_ASSIGNMENT_STATUSES,
  V3_TEST_RESULT_STATUSES,
  type V3AnswerSheetManifestEnvelope,
  type V3ApiSuccessEnvelope,
  type V3MobileDownloadEnvelope,
  type V3MobileReferenceDataEnvelope,
} from './contracts';

type JsonObject = Record<string, unknown>;
type Validator = (value: unknown, path: string) => void;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export class V3ContractParseError extends Error {
  constructor(path: string, expectation: string) {
    super(`${path}: expected ${expectation}`);
    this.name = 'V3ContractParseError';
  }
}

const fail = (path: string, expectation: string): never => {
  throw new V3ContractParseError(path, expectation);
};

const objectAt = (value: unknown, path: string): JsonObject => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(path, 'an object');
  }
  return value as JsonObject;
};

const arrayAt = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    return fail(path, 'an array');
  }
  return value;
};

const fieldAt = (object: JsonObject, key: string, path: string): unknown => {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return fail(`${path}.${key}`, 'a present field');
  }
  return object[key];
};

const stringAt = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    return fail(path, 'a string');
  }
  return value;
};

const nonEmptyStringAt = (value: unknown, path: string): string => {
  const result = stringAt(value, path);
  if (result.trim().length === 0) {
    return fail(path, 'a non-empty string');
  }
  return result;
};

const booleanAt = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') {
    return fail(path, 'a boolean');
  }
  return value;
};

const numberAt = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(path, 'a finite number');
  }
  return value;
};

const integerAt = (value: unknown, path: string): number => {
  const result = numberAt(value, path);
  if (!Number.isSafeInteger(result)) {
    return fail(path, 'a safe integer');
  }
  return result;
};

const positiveIntegerAt = (value: unknown, path: string): number => {
  const result = integerAt(value, path);
  if (result <= 0) {
    return fail(path, 'a positive integer');
  }
  return result;
};

const nullableAt = (
  value: unknown,
  path: string,
  validator: Validator,
): void => {
  if (value !== null) {
    validator(value, path);
  }
};

const enumAt = <T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
): T => {
  const result = stringAt(value, path);
  if (!allowed.includes(result as T)) {
    return fail(path, `one of: ${allowed.join(', ')}`);
  }
  return result as T;
};

const literalAt = <T extends string>(
  value: unknown,
  path: string,
  expected: T,
): T => {
  if (value !== expected) {
    return fail(path, JSON.stringify(expected));
  }
  return expected;
};

const instantAt = (value: unknown, path: string): string => {
  const result = stringAt(value, path);
  if (!result.endsWith('Z') || Number.isNaN(Date.parse(result))) {
    return fail(path, 'a UTC ISO-8601 timestamp');
  }
  return result;
};

const localDateAt = (value: unknown, path: string): string => {
  const result = stringAt(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) {
    return fail(path, 'a YYYY-MM-DD local date');
  }
  const normalized = new Date(`${result}T00:00:00Z`);
  if (
    Number.isNaN(normalized.getTime()) ||
    normalized.getUTCFullYear() !== Number(match[1]) ||
    normalized.getUTCMonth() + 1 !== Number(match[2]) ||
    normalized.getUTCDate() !== Number(match[3])
  ) {
    return fail(path, 'a valid YYYY-MM-DD local date');
  }
  return result;
};

const localTimeAt = (value: unknown, path: string): string => {
  const result = stringAt(value, path);
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?$/.exec(result);
  if (
    !match ||
    Number(match[1]) > 23 ||
    Number(match[2]) > 59 ||
    Number(match[3]) > 59
  ) {
    return fail(path, 'a valid HH:mm:ss local time');
  }
  return result;
};

const uuidAt = (value: unknown, path: string): string => {
  const result = stringAt(value, path);
  if (!UUID_PATTERN.test(result)) {
    return fail(path, 'a canonical lowercase UUID');
  }
  return result;
};

const sha256At = (value: unknown, path: string): string => {
  const result = stringAt(value, path);
  if (!SHA256_PATTERN.test(result)) {
    return fail(path, 'a 64-character lowercase SHA-256 hash');
  }
  return result;
};

const validateArray = (
  value: unknown,
  path: string,
  validator: Validator,
): void => {
  arrayAt(value, path).forEach((item, index) =>
    validator(item, `${path}[${index}]`),
  );
};

const validateStringArray = (
  value: unknown,
  path: string,
  allowed?: readonly string[],
): void => {
  validateArray(value, path, (item, itemPath) => {
    if (allowed) {
      enumAt(item, itemPath, allowed);
    } else {
      nonEmptyStringAt(item, itemPath);
    }
  });
};

const validateRectangle = (value: unknown, path: string): void => {
  const object = objectAt(value, path);
  numberAt(fieldAt(object, 'x', path), `${path}.x`);
  numberAt(fieldAt(object, 'y', path), `${path}.y`);
  numberAt(fieldAt(object, 'width', path), `${path}.width`);
  numberAt(fieldAt(object, 'height', path), `${path}.height`);
};

const validateSuccessEnvelope = <T>(
  value: unknown,
  dataValidator: Validator,
): V3ApiSuccessEnvelope<T> => {
  const envelope = objectAt(value, '$');
  if (fieldAt(envelope, 'success', '$') !== true) {
    fail('$.success', 'true');
  }
  nonEmptyStringAt(fieldAt(envelope, 'message', '$'), '$.message');
  dataValidator(fieldAt(envelope, 'data', '$'), '$.data');
  if (fieldAt(envelope, 'errors', '$') !== null) {
    fail('$.errors', 'null for a success envelope');
  }
  instantAt(fieldAt(envelope, 'timestamp', '$'), '$.timestamp');
  return value as V3ApiSuccessEnvelope<T>;
};

const validateQuestionTypeCapability: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'questionTypeId', path),
    `${path}.questionTypeId`,
  );
  enumAt(fieldAt(object, 'code', path), `${path}.code`, V3_QUESTION_TYPE_CODES);
  nonEmptyStringAt(fieldAt(object, 'name', path), `${path}.name`);
  enumAt(
    fieldAt(object, 'captureMode', path),
    `${path}.captureMode`,
    V3_CAPTURE_MODES,
  );
  enumAt(
    fieldAt(object, 'scoringMode', path),
    `${path}.scoringMode`,
    V3_SCORING_MODES,
  );
  booleanAt(fieldAt(object, 'supportsOmr', path), `${path}.supportsOmr`);
  booleanAt(fieldAt(object, 'supportsOcr', path), `${path}.supportsOcr`);
  booleanAt(
    fieldAt(object, 'supportsMultipleResponse', path),
    `${path}.supportsMultipleResponse`,
  );
  booleanAt(
    fieldAt(object, 'requiresAttachment', path),
    `${path}.requiresAttachment`,
  );
  booleanAt(
    fieldAt(object, 'requiresTeacherVerification', path),
    `${path}.requiresTeacherVerification`,
  );
  booleanAt(
    fieldAt(object, 'allowsTeacherAnswerEdit', path),
    `${path}.allowsTeacherAnswerEdit`,
  );
};

const validatePaperSizeCapability: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'paperSizeId', path),
    `${path}.paperSizeId`,
  );
  enumAt(fieldAt(object, 'code', path), `${path}.code`, V3_PAPER_SIZE_CODES);
  nonEmptyStringAt(fieldAt(object, 'name', path), `${path}.name`);
  numberAt(fieldAt(object, 'widthPt', path), `${path}.widthPt`);
  numberAt(fieldAt(object, 'heightPt', path), `${path}.heightPt`);
  booleanAt(
    fieldAt(object, 'operationallySupported', path),
    `${path}.operationallySupported`,
  );
};

const validateTemplateRegion: Validator = (value, path) => {
  const object = objectAt(value, path);
  uuidAt(fieldAt(object, 'regionUuid', path), `${path}.regionUuid`);
  nonEmptyStringAt(fieldAt(object, 'regionCode', path), `${path}.regionCode`);
  positiveIntegerAt(
    fieldAt(object, 'regionOrder', path),
    `${path}.regionOrder`,
  );
  nonEmptyStringAt(fieldAt(object, 'regionType', path), `${path}.regionType`);
  nullableAt(
    fieldAt(object, 'questionType', path),
    `${path}.questionType`,
    (item, itemPath) => {
      enumAt(item, itemPath, V3_QUESTION_TYPE_CODES);
    },
  );
  nullableAt(
    fieldAt(object, 'layoutVariant', path),
    `${path}.layoutVariant`,
    stringAt,
  );
  nullableAt(
    fieldAt(object, 'responseRegionSize', path),
    `${path}.responseRegionSize`,
    stringAt,
  );
  validateRectangle(fieldAt(object, 'rectangle', path), `${path}.rectangle`);
  fieldAt(object, 'geometry', path);
  sha256At(fieldAt(object, 'geometryHash', path), `${path}.geometryHash`);
  booleanAt(fieldAt(object, 'required', path), `${path}.required`);
};

const validateOmrTemplateCapability: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'omrTemplateId', path),
    `${path}.omrTemplateId`,
  );
  nonEmptyStringAt(fieldAt(object, 'code', path), `${path}.code`);
  nonEmptyStringAt(fieldAt(object, 'name', path), `${path}.name`);
  nonEmptyStringAt(fieldAt(object, 'version', path), `${path}.version`);
  // Null for a mixed-question-type template (e.g. the dynamic OMR-*-DYNAMIC-CTX-V3
  // family, which spans multiple_choice/true_false/identification/... rather than
  // one single type) - same nullability convention already used by the sibling
  // V3TemplateRegion.questionType field for exactly this "not one single type" case.
  nullableAt(
    fieldAt(object, 'questionType', path),
    `${path}.questionType`,
    (v, p) => {
      enumAt(v, p, V3_QUESTION_TYPE_CODES);
    },
  );
  enumAt(
    fieldAt(object, 'paperSize', path),
    `${path}.paperSize`,
    V3_PAPER_SIZE_CODES,
  );
  enumAt(
    fieldAt(object, 'orientation', path),
    `${path}.orientation`,
    V3_ORIENTATIONS,
  );
  nullableAt(
    fieldAt(object, 'minimumItemCount', path),
    `${path}.minimumItemCount`,
    positiveIntegerAt,
  );
  nullableAt(
    fieldAt(object, 'maximumItemCount', path),
    `${path}.maximumItemCount`,
    positiveIntegerAt,
  );
  nullableAt(
    fieldAt(object, 'optionCount', path),
    `${path}.optionCount`,
    positiveIntegerAt,
  );
  positiveIntegerAt(
    fieldAt(object, 'qrPayloadVersion', path),
    `${path}.qrPayloadVersion`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'minimumScannerVersion', path),
    `${path}.minimumScannerVersion`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'coordinateOrigin', path),
    `${path}.coordinateOrigin`,
  );
  numberAt(
    fieldAt(object, 'requiredPrintScalePercent', path),
    `${path}.requiredPrintScalePercent`,
  );
  sha256At(fieldAt(object, 'geometryHash', path), `${path}.geometryHash`);
  booleanAt(
    fieldAt(object, 'physicallyValidated', path),
    `${path}.physicallyValidated`,
  );
  validateArray(
    fieldAt(object, 'regions', path),
    `${path}.regions`,
    validateTemplateRegion,
  );
};

const validateStatuses: Validator = (value, path) => {
  const object = objectAt(value, path);
  validateStringArray(
    fieldAt(object, 'testAssignments', path),
    `${path}.testAssignments`,
    V3_TEST_ASSIGNMENT_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'scanSessions', path),
    `${path}.scanSessions`,
    V3_SCAN_SESSION_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'omrDetections', path),
    `${path}.omrDetections`,
    V3_OMR_DETECTION_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'studentAnswers', path),
    `${path}.studentAnswers`,
    V3_STUDENT_ANSWER_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'answerEvaluation', path),
    `${path}.answerEvaluation`,
    V3_ANSWER_EVALUATION_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'testResults', path),
    `${path}.testResults`,
    V3_TEST_RESULT_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'syncs', path),
    `${path}.syncs`,
    V3_SYNC_STATUSES,
  );
  validateStringArray(
    fieldAt(object, 'syncItems', path),
    `${path}.syncItems`,
    V3_SYNC_ITEM_STATUSES,
  );
};

const validateSyncPolicy: Validator = (value, path) => {
  const object = objectAt(value, path);
  literalAt(
    fieldAt(object, 'syncAction', path),
    `${path}.syncAction`,
    'upsert',
  );
  booleanAt(
    fieldAt(object, 'oneAssignmentPerSync', path),
    `${path}.oneAssignmentPerSync`,
  );
  validateStringArray(
    fieldAt(object, 'stableUuids', path),
    `${path}.stableUuids`,
  );
  literalAt(
    fieldAt(object, 'identicalRetryStatus', path),
    `${path}.identicalRetryStatus`,
    'replayed',
  );
  literalAt(
    fieldAt(object, 'changedPayloadConflictCode', path),
    `${path}.changedPayloadConflictCode`,
    'IDEMPOTENCY_KEY_REUSE',
  );
  booleanAt(
    fieldAt(object, 'scanPageUploadAvailable', path),
    `${path}.scanPageUploadAvailable`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'scanPageUploadAvailabilityReason', path),
    `${path}.scanPageUploadAvailabilityReason`,
  );
  positiveIntegerAt(
    fieldAt(object, 'maximumQrPayloadBytes', path),
    `${path}.maximumQrPayloadBytes`,
  );
  positiveIntegerAt(
    fieldAt(object, 'minimumAnswerSheetQuestions', path),
    `${path}.minimumAnswerSheetQuestions`,
  );
};

const validateReferenceData: Validator = (value, path) => {
  const object = objectAt(value, path);
  literalAt(
    fieldAt(object, 'contractVersion', path),
    `${path}.contractVersion`,
    V3_CONTRACT_VERSION,
  );
  instantAt(fieldAt(object, 'serverTime', path), `${path}.serverTime`);
  literalAt(
    fieldAt(object, 'downloadMode', path),
    `${path}.downloadMode`,
    V3_SNAPSHOT_MODE,
  );
  validateArray(
    fieldAt(object, 'questionTypes', path),
    `${path}.questionTypes`,
    validateQuestionTypeCapability,
  );
  validateArray(
    fieldAt(object, 'paperSizes', path),
    `${path}.paperSizes`,
    validatePaperSizeCapability,
  );
  validateArray(
    fieldAt(object, 'omrTemplates', path),
    `${path}.omrTemplates`,
    validateOmrTemplateCapability,
  );
  validateStatuses(fieldAt(object, 'statuses', path), `${path}.statuses`);
  validateSyncPolicy(fieldAt(object, 'syncPolicy', path), `${path}.syncPolicy`);
};

const validateTeacher: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(fieldAt(object, 'userId', path), `${path}.userId`);
  nonEmptyStringAt(fieldAt(object, 'schoolId', path), `${path}.schoolId`);
  nonEmptyStringAt(fieldAt(object, 'email', path), `${path}.email`);
};

const validateClassAssignment: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'classAssignmentId', path),
    `${path}.classAssignmentId`,
  );
  positiveIntegerAt(fieldAt(object, 'classId', path), `${path}.classId`);
  positiveIntegerAt(
    fieldAt(object, 'academicYearId', path),
    `${path}.academicYearId`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'academicYearName', path),
    `${path}.academicYearName`,
  );
  positiveIntegerAt(
    fieldAt(object, 'gradeLevelId', path),
    `${path}.gradeLevelId`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'gradeLevelName', path),
    `${path}.gradeLevelName`,
  );
  positiveIntegerAt(fieldAt(object, 'sectionId', path), `${path}.sectionId`);
  nonEmptyStringAt(fieldAt(object, 'sectionName', path), `${path}.sectionName`);
  positiveIntegerAt(fieldAt(object, 'subjectId', path), `${path}.subjectId`);
  nonEmptyStringAt(fieldAt(object, 'subjectCode', path), `${path}.subjectCode`);
  nonEmptyStringAt(fieldAt(object, 'subjectName', path), `${path}.subjectName`);
  nonEmptyStringAt(
    fieldAt(object, 'assignmentRole', path),
    `${path}.assignmentRole`,
  );
  nonEmptyStringAt(fieldAt(object, 'status', path), `${path}.status`);
  nonEmptyStringAt(fieldAt(object, 'classStatus', path), `${path}.classStatus`);
};

const validateClassAssignmentSchedule: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'classAssignmentScheduleId', path),
    `${path}.classAssignmentScheduleId`,
  );
  uuidAt(fieldAt(object, 'scheduleUuid', path), `${path}.scheduleUuid`);
  positiveIntegerAt(
    fieldAt(object, 'classAssignmentId', path),
    `${path}.classAssignmentId`,
  );
  const dayOfWeek = integerAt(
    fieldAt(object, 'dayOfWeek', path),
    `${path}.dayOfWeek`,
  );
  if (dayOfWeek < 1 || dayOfWeek > 7) {
    fail(`${path}.dayOfWeek`, 'an ISO weekday from 1 through 7');
  }
  const startTime = localTimeAt(
    fieldAt(object, 'startTime', path),
    `${path}.startTime`,
  );
  const endTime = localTimeAt(
    fieldAt(object, 'endTime', path),
    `${path}.endTime`,
  );
  if (endTime <= startTime) {
    fail(`${path}.endTime`, 'a local time after startTime');
  }
  nonEmptyStringAt(
    fieldAt(object, 'timezoneName', path),
    `${path}.timezoneName`,
  );
  const effectiveFrom = localDateAt(
    fieldAt(object, 'effectiveFrom', path),
    `${path}.effectiveFrom`,
  );
  const effectiveToValue = fieldAt(object, 'effectiveTo', path);
  nullableAt(effectiveToValue, `${path}.effectiveTo`, localDateAt);
  if (typeof effectiveToValue === 'string' && effectiveToValue < effectiveFrom) {
    fail(`${path}.effectiveTo`, 'a local date on or after effectiveFrom');
  }
  enumAt(fieldAt(object, 'scheduleStatus', path), `${path}.scheduleStatus`, [
    'active',
    'archived',
  ] as const);
  instantAt(fieldAt(object, 'updatedAt', path), `${path}.updatedAt`);
};

const validateClassList: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'classListId', path),
    `${path}.classListId`,
  );
  uuidAt(fieldAt(object, 'membershipUuid', path), `${path}.membershipUuid`);
  positiveIntegerAt(fieldAt(object, 'classId', path), `${path}.classId`);
  positiveIntegerAt(fieldAt(object, 'studentId', path), `${path}.studentId`);
  nonEmptyStringAt(
    fieldAt(object, 'enrollmentStatus', path),
    `${path}.enrollmentStatus`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'enrollmentSource', path),
    `${path}.enrollmentSource`,
  );
  instantAt(fieldAt(object, 'enrolledAt', path), `${path}.enrolledAt`);
};

const validateStudent: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(fieldAt(object, 'studentId', path), `${path}.studentId`);
  nonEmptyStringAt(fieldAt(object, 'studentLrn', path), `${path}.studentLrn`);
  nonEmptyStringAt(fieldAt(object, 'firstName', path), `${path}.firstName`);
  nullableAt(
    fieldAt(object, 'middleName', path),
    `${path}.middleName`,
    stringAt,
  );
  nonEmptyStringAt(fieldAt(object, 'lastName', path), `${path}.lastName`);
  nullableAt(fieldAt(object, 'suffix', path), `${path}.suffix`, stringAt);
  nullableAt(fieldAt(object, 'gender', path), `${path}.gender`, stringAt);
  nonEmptyStringAt(fieldAt(object, 'status', path), `${path}.status`);
};

const validateTermPeriod: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'termPeriodId', path),
    `${path}.termPeriodId`,
  );
  positiveIntegerAt(
    fieldAt(object, 'academicYearId', path),
    `${path}.academicYearId`,
  );
  nonEmptyStringAt(fieldAt(object, 'termName', path), `${path}.termName`);
  positiveIntegerAt(fieldAt(object, 'termOrder', path), `${path}.termOrder`);
  instantAt(fieldAt(object, 'startAt', path), `${path}.startAt`);
  instantAt(fieldAt(object, 'endAt', path), `${path}.endAt`);
  nonEmptyStringAt(fieldAt(object, 'status', path), `${path}.status`);
};

const validateTestAssignment: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'testAssignmentId', path),
    `${path}.testAssignmentId`,
  );
  uuidAt(fieldAt(object, 'assignmentUuid', path), `${path}.assignmentUuid`);
  positiveIntegerAt(fieldAt(object, 'testId', path), `${path}.testId`);
  positiveIntegerAt(
    fieldAt(object, 'classAssignmentId', path),
    `${path}.classAssignmentId`,
  );
  nullableAt(fieldAt(object, 'openAt', path), `${path}.openAt`, instantAt);
  nullableAt(fieldAt(object, 'closeAt', path), `${path}.closeAt`, instantAt);
  enumAt(
    fieldAt(object, 'assignmentStatus', path),
    `${path}.assignmentStatus`,
    V3_TEST_ASSIGNMENT_STATUSES,
  );
  booleanAt(
    fieldAt(object, 'allowLateCapture', path),
    `${path}.allowLateCapture`,
  );
  booleanAt(
    fieldAt(object, 'captureAllowedNow', path),
    `${path}.captureAllowedNow`,
  );
  enumAt(
    fieldAt(object, 'captureAvailability', path),
    `${path}.captureAvailability`,
    V3_CAPTURE_AVAILABILITIES,
  );
};

const validateTest: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(fieldAt(object, 'testId', path), `${path}.testId`);
  uuidAt(fieldAt(object, 'testUuid', path), `${path}.testUuid`);
  positiveIntegerAt(
    fieldAt(object, 'versionNumber', path),
    `${path}.versionNumber`,
  );
  positiveIntegerAt(
    fieldAt(object, 'termPeriodId', path),
    `${path}.termPeriodId`,
  );
  nonEmptyStringAt(fieldAt(object, 'testName', path), `${path}.testName`);
  nonEmptyStringAt(fieldAt(object, 'testType', path), `${path}.testType`);
  nullableAt(
    fieldAt(object, 'instructions', path),
    `${path}.instructions`,
    stringAt,
  );
  positiveIntegerAt(fieldAt(object, 'totalItems', path), `${path}.totalItems`);
  nonEmptyStringAt(fieldAt(object, 'status', path), `${path}.status`);
};

const validateTestPart: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(fieldAt(object, 'testPartId', path), `${path}.testPartId`);
  positiveIntegerAt(fieldAt(object, 'testId', path), `${path}.testId`);
  positiveIntegerAt(fieldAt(object, 'partOrder', path), `${path}.partOrder`);
  nonEmptyStringAt(fieldAt(object, 'partName', path), `${path}.partName`);
  positiveIntegerAt(
    fieldAt(object, 'questionTypeId', path),
    `${path}.questionTypeId`,
  );
  positiveIntegerAt(
    fieldAt(object, 'numberOfItems', path),
    `${path}.numberOfItems`,
  );
  numberAt(fieldAt(object, 'pointsPerItem', path), `${path}.pointsPerItem`);
  nullableAt(
    fieldAt(object, 'instructions', path),
    `${path}.instructions`,
    stringAt,
  );
};

const validateQuestion: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(fieldAt(object, 'questionId', path), `${path}.questionId`);
  uuidAt(fieldAt(object, 'questionUuid', path), `${path}.questionUuid`);
  positiveIntegerAt(fieldAt(object, 'testPartId', path), `${path}.testPartId`);
  positiveIntegerAt(
    fieldAt(object, 'questionTypeId', path),
    `${path}.questionTypeId`,
  );
  positiveIntegerAt(fieldAt(object, 'itemNumber', path), `${path}.itemNumber`);
  positiveIntegerAt(
    fieldAt(object, 'globalItemNumber', path),
    `${path}.globalItemNumber`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'questionText', path),
    `${path}.questionText`,
  );
  numberAt(fieldAt(object, 'maximumPoints', path), `${path}.maximumPoints`);
  nullableAt(
    fieldAt(object, 'rubricId', path),
    `${path}.rubricId`,
    positiveIntegerAt,
  );
  nullableAt(
    fieldAt(object, 'responseInstructions', path),
    `${path}.responseInstructions`,
    stringAt,
  );
  booleanAt(
    fieldAt(object, 'answerOrderRequired', path),
    `${path}.answerOrderRequired`,
  );
  nullableAt(
    fieldAt(object, 'maximumResponseLength', path),
    `${path}.maximumResponseLength`,
    positiveIntegerAt,
  );
  nullableAt(
    fieldAt(object, 'expectedResponseCount', path),
    `${path}.expectedResponseCount`,
    positiveIntegerAt,
  );
  nullableAt(
    fieldAt(object, 'responseRegionSize', path),
    `${path}.responseRegionSize`,
    stringAt,
  );
  booleanAt(
    fieldAt(object, 'forcePageBreakBefore', path),
    `${path}.forcePageBreakBefore`,
  );
};

const validateQuestionOption: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'questionOptionId', path),
    `${path}.questionOptionId`,
  );
  positiveIntegerAt(fieldAt(object, 'questionId', path), `${path}.questionId`);
  nonEmptyStringAt(fieldAt(object, 'optionKey', path), `${path}.optionKey`);
  nonEmptyStringAt(fieldAt(object, 'optionText', path), `${path}.optionText`);
  positiveIntegerAt(
    fieldAt(object, 'optionOrder', path),
    `${path}.optionOrder`,
  );
};

const validatePartSkillMapping: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'partSkillMappingId', path),
    `${path}.partSkillMappingId`,
  );
  positiveIntegerAt(fieldAt(object, 'testPartId', path), `${path}.testPartId`);
  positiveIntegerAt(fieldAt(object, 'skillId', path), `${path}.skillId`);
  positiveIntegerAt(
    fieldAt(object, 'startItemNumber', path),
    `${path}.startItemNumber`,
  );
  positiveIntegerAt(
    fieldAt(object, 'endItemNumber', path),
    `${path}.endItemNumber`,
  );
  positiveIntegerAt(fieldAt(object, 'itemCount', path), `${path}.itemCount`);
};

const validateSkill: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(fieldAt(object, 'skillId', path), `${path}.skillId`);
  positiveIntegerAt(
    fieldAt(object, 'competencyId', path),
    `${path}.competencyId`,
  );
  nonEmptyStringAt(
    fieldAt(object, 'competencyName', path),
    `${path}.competencyName`,
  );
  positiveIntegerAt(fieldAt(object, 'rootTagId', path), `${path}.rootTagId`);
  nonEmptyStringAt(fieldAt(object, 'rootTagName', path), `${path}.rootTagName`);
  positiveIntegerAt(
    fieldAt(object, 'termPeriodId', path),
    `${path}.termPeriodId`,
  );
  positiveIntegerAt(
    fieldAt(object, 'gradeLevelId', path),
    `${path}.gradeLevelId`,
  );
  positiveIntegerAt(fieldAt(object, 'subjectId', path), `${path}.subjectId`);
};

const validateAnswerSheetIdentity: Validator = (value, path) => {
  const object = objectAt(value, path);
  uuidAt(fieldAt(object, 'answerSheetUuid', path), `${path}.answerSheetUuid`);
  positiveIntegerAt(
    fieldAt(object, 'testAssignmentId', path),
    `${path}.testAssignmentId`,
  );
  uuidAt(fieldAt(object, 'assignmentUuid', path), `${path}.assignmentUuid`);
  enumAt(
    fieldAt(object, 'paperSize', path),
    `${path}.paperSize`,
    V3_PAPER_SIZE_CODES,
  );
  positiveIntegerAt(
    fieldAt(object, 'generationNumber', path),
    `${path}.generationNumber`,
  );
  positiveIntegerAt(
    fieldAt(object, 'testVersionNumber', path),
    `${path}.testVersionNumber`,
  );
  positiveIntegerAt(
    fieldAt(object, 'totalQuestions', path),
    `${path}.totalQuestions`,
  );
  positiveIntegerAt(fieldAt(object, 'totalPages', path), `${path}.totalPages`);
  positiveIntegerAt(
    fieldAt(object, 'manifestVersion', path),
    `${path}.manifestVersion`,
  );
  sha256At(fieldAt(object, 'manifestHash', path), `${path}.manifestHash`);
  nonEmptyStringAt(
    fieldAt(object, 'requiredScannerVersion', path),
    `${path}.requiredScannerVersion`,
  );
  instantAt(fieldAt(object, 'generatedAt', path), `${path}.generatedAt`);
};

const validateNoSensitiveDownloadFields = (
  object: JsonObject,
  path: string,
): void => {
  ['answerKeys', 'acceptedAnswers', 'scores', 'analytics'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      fail(`${path}.${key}`, 'to be absent from the Mobile download contract');
    }
  });
};

const validateDownload: Validator = (value, path) => {
  const object = objectAt(value, path);
  validateNoSensitiveDownloadFields(object, path);
  literalAt(
    fieldAt(object, 'contractVersion', path),
    `${path}.contractVersion`,
    V3_CONTRACT_VERSION,
  );
  literalAt(
    fieldAt(object, 'snapshotMode', path),
    `${path}.snapshotMode`,
    V3_SNAPSHOT_MODE,
  );
  instantAt(fieldAt(object, 'generatedAt', path), `${path}.generatedAt`);
  validateTeacher(fieldAt(object, 'teacher', path), `${path}.teacher`);
  validateArray(
    fieldAt(object, 'classAssignments', path),
    `${path}.classAssignments`,
    validateClassAssignment,
  );
  validateArray(
    fieldAt(object, 'classAssignmentSchedules', path),
    `${path}.classAssignmentSchedules`,
    validateClassAssignmentSchedule,
  );
  validateArray(
    fieldAt(object, 'classLists', path),
    `${path}.classLists`,
    validateClassList,
  );
  validateArray(
    fieldAt(object, 'students', path),
    `${path}.students`,
    validateStudent,
  );
  validateArray(
    fieldAt(object, 'termPeriods', path),
    `${path}.termPeriods`,
    validateTermPeriod,
  );
  validateArray(
    fieldAt(object, 'testAssignments', path),
    `${path}.testAssignments`,
    validateTestAssignment,
  );
  validateArray(fieldAt(object, 'tests', path), `${path}.tests`, validateTest);
  validateArray(
    fieldAt(object, 'testParts', path),
    `${path}.testParts`,
    validateTestPart,
  );
  validateArray(
    fieldAt(object, 'questions', path),
    `${path}.questions`,
    validateQuestion,
  );
  validateArray(
    fieldAt(object, 'questionOptions', path),
    `${path}.questionOptions`,
    validateQuestionOption,
  );
  validateArray(
    fieldAt(object, 'partSkillMappings', path),
    `${path}.partSkillMappings`,
    validatePartSkillMapping,
  );
  validateArray(
    fieldAt(object, 'skills', path),
    `${path}.skills`,
    validateSkill,
  );
  validateArray(
    fieldAt(object, 'answerSheets', path),
    `${path}.answerSheets`,
    validateAnswerSheetIdentity,
  );
};

const validateManifestTemplate: Validator = (value, path) => {
  const object = objectAt(value, path);
  nonEmptyStringAt(fieldAt(object, 'code', path), `${path}.code`);
  nonEmptyStringAt(fieldAt(object, 'version', path), `${path}.version`);
  sha256At(fieldAt(object, 'geometryHash', path), `${path}.geometryHash`);
};

const validateManifestQr: Validator = (value, path) => {
  const object = objectAt(value, path);
  positiveIntegerAt(
    fieldAt(object, 'payloadVersion', path),
    `${path}.payloadVersion`,
  );
  nonEmptyStringAt(fieldAt(object, 'payload', path), `${path}.payload`);
  sha256At(fieldAt(object, 'payloadHash', path), `${path}.payloadHash`);
  nonEmptyStringAt(
    fieldAt(object, 'errorCorrection', path),
    `${path}.errorCorrection`,
  );
};

const validateCoordinateSpace: Validator = (value, path) => {
  const object = objectAt(value, path);
  nonEmptyStringAt(fieldAt(object, 'unit', path), `${path}.unit`);
  nonEmptyStringAt(fieldAt(object, 'origin', path), `${path}.origin`);
  numberAt(fieldAt(object, 'width', path), `${path}.width`);
  numberAt(fieldAt(object, 'height', path), `${path}.height`);
};

const validateManifestOption: Validator = (value, path) => {
  const object = objectAt(value, path);
  nonEmptyStringAt(fieldAt(object, 'key', path), `${path}.key`);
  nonEmptyStringAt(fieldAt(object, 'storedValue', path), `${path}.storedValue`);
  numberAt(fieldAt(object, 'centerX', path), `${path}.centerX`);
  numberAt(fieldAt(object, 'centerY', path), `${path}.centerY`);
};

const validateManifestRegion: Validator = (value, path) => {
  const object = objectAt(value, path);
  uuidAt(fieldAt(object, 'regionUuid', path), `${path}.regionUuid`);
  nonEmptyStringAt(
    fieldAt(object, 'templateRegionCode', path),
    `${path}.templateRegionCode`,
  );
  positiveIntegerAt(fieldAt(object, 'questionId', path), `${path}.questionId`);
  uuidAt(fieldAt(object, 'questionUuid', path), `${path}.questionUuid`);
  positiveIntegerAt(fieldAt(object, 'testPartId', path), `${path}.testPartId`);
  positiveIntegerAt(
    fieldAt(object, 'globalItemNumber', path),
    `${path}.globalItemNumber`,
  );
  positiveIntegerAt(
    fieldAt(object, 'partItemNumber', path),
    `${path}.partItemNumber`,
  );
  enumAt(
    fieldAt(object, 'questionType', path),
    `${path}.questionType`,
    V3_QUESTION_TYPE_CODES,
  );
  nonEmptyStringAt(fieldAt(object, 'regionType', path), `${path}.regionType`);
  nullableAt(
    fieldAt(object, 'responseRegionSize', path),
    `${path}.responseRegionSize`,
    stringAt,
  );
  nullableAt(
    fieldAt(object, 'expectedResponseCount', path),
    `${path}.expectedResponseCount`,
    positiveIntegerAt,
  );
  nullableAt(
    fieldAt(object, 'responseLineCount', path),
    `${path}.responseLineCount`,
    positiveIntegerAt,
  );
  validateRectangle(fieldAt(object, 'rectangle', path), `${path}.rectangle`);
  sha256At(fieldAt(object, 'geometryHash', path), `${path}.geometryHash`);
  validateArray(
    fieldAt(object, 'options', path),
    `${path}.options`,
    validateManifestOption,
  );
};

const validateManifestTemplateRegion: Validator = (value, path) => {
  const object = objectAt(value, path);
  uuidAt(fieldAt(object, 'regionUuid', path), `${path}.regionUuid`);
  nonEmptyStringAt(fieldAt(object, 'regionCode', path), `${path}.regionCode`);
  positiveIntegerAt(fieldAt(object, 'regionOrder', path), `${path}.regionOrder`);
  nonEmptyStringAt(fieldAt(object, 'regionType', path), `${path}.regionType`);
  nullableAt(fieldAt(object, 'questionType', path), `${path}.questionType`, stringAt);
  nullableAt(fieldAt(object, 'layoutVariant', path), `${path}.layoutVariant`, stringAt);
  nullableAt(
    fieldAt(object, 'responseRegionSize', path),
    `${path}.responseRegionSize`,
    stringAt,
  );
  validateRectangle(fieldAt(object, 'rectangle', path), `${path}.rectangle`);
  // Deliberately opaque: only checked to be an object or null, never its inner shape.
  nullableAt(fieldAt(object, 'geometry', path), `${path}.geometry`, objectAt);
  sha256At(fieldAt(object, 'geometryHash', path), `${path}.geometryHash`);
  booleanAt(fieldAt(object, 'required', path), `${path}.required`);
};

const V3_MARKER_CORNERS = [
  'top_left',
  'top_right',
  'bottom_right',
  'bottom_left',
] as const;
const V3_MARKER_STYLES = ['hollow', 'solid'] as const;

const validateManifestRegistrationMarker: Validator = (value, path) => {
  const object = objectAt(value, path);
  nonEmptyStringAt(fieldAt(object, 'markerId', path), `${path}.markerId`);
  enumAt(fieldAt(object, 'corner', path), `${path}.corner`, V3_MARKER_CORNERS);
  enumAt(fieldAt(object, 'style', path), `${path}.style`, V3_MARKER_STYLES);
  validateRectangle(fieldAt(object, 'rectangle', path), `${path}.rectangle`);
};

const validateManifestMarkerPattern: Validator = (value, path) => {
  const object = objectAt(value, path);
  enumAt(
    fieldAt(object, 'orientationCorner', path),
    `${path}.orientationCorner`,
    V3_MARKER_CORNERS,
  );
  enumAt(
    fieldAt(object, 'orientationStyle', path),
    `${path}.orientationStyle`,
    V3_MARKER_STYLES,
  );
  enumAt(fieldAt(object, 'locatorStyle', path), `${path}.locatorStyle`, V3_MARKER_STYLES);
};

const validateManifestDesignSystem: Validator = (value, path) => {
  const object = objectAt(value, path);
  nonEmptyStringAt(fieldAt(object, 'code', path), `${path}.code`);
  nonEmptyStringAt(fieldAt(object, 'version', path), `${path}.version`);
  booleanAt(
    fieldAt(object, 'nativePaperGeometry', path),
    `${path}.nativePaperGeometry`,
  );
};

const validateManifestPage: Validator = (value, path) => {
  const object = objectAt(value, path);
  uuidAt(fieldAt(object, 'pageUuid', path), `${path}.pageUuid`);
  positiveIntegerAt(fieldAt(object, 'pageNumber', path), `${path}.pageNumber`);
  positiveIntegerAt(fieldAt(object, 'totalPages', path), `${path}.totalPages`);
  validateManifestTemplate(
    fieldAt(object, 'template', path),
    `${path}.template`,
  );
  validateManifestQr(fieldAt(object, 'qr', path), `${path}.qr`);
  validateCoordinateSpace(
    fieldAt(object, 'coordinateSpace', path),
    `${path}.coordinateSpace`,
  );
  validateArray(
    fieldAt(object, 'regions', path),
    `${path}.regions`,
    validateManifestRegion,
  );
  nullableAt(
    fieldAt(object, 'pageGeometryHash', path),
    `${path}.pageGeometryHash`,
    sha256At,
  );
  validateArray(
    fieldAt(object, 'templateRegions', path),
    `${path}.templateRegions`,
    validateManifestTemplateRegion,
  );
  validateArray(
    fieldAt(object, 'registrationMarkers', path),
    `${path}.registrationMarkers`,
    validateManifestRegistrationMarker,
  );
  validateManifestMarkerPattern(
    fieldAt(object, 'markerPattern', path),
    `${path}.markerPattern`,
  );
};

const validateManifest: Validator = (value, path) => {
  const object = objectAt(value, path);
  literalAt(
    fieldAt(object, 'contractVersion', path),
    `${path}.contractVersion`,
    V3_CONTRACT_VERSION,
  );
  positiveIntegerAt(
    fieldAt(object, 'manifestVersion', path),
    `${path}.manifestVersion`,
  );
  uuidAt(fieldAt(object, 'answerSheetUuid', path), `${path}.answerSheetUuid`);

  const assignment = objectAt(
    fieldAt(object, 'testAssignment', path),
    `${path}.testAssignment`,
  );
  positiveIntegerAt(
    fieldAt(assignment, 'testAssignmentId', `${path}.testAssignment`),
    `${path}.testAssignment.testAssignmentId`,
  );
  uuidAt(
    fieldAt(assignment, 'assignmentUuid', `${path}.testAssignment`),
    `${path}.testAssignment.assignmentUuid`,
  );

  const paperSize = objectAt(
    fieldAt(object, 'paperSize', path),
    `${path}.paperSize`,
  );
  enumAt(
    fieldAt(paperSize, 'code', `${path}.paperSize`),
    `${path}.paperSize.code`,
    V3_PAPER_SIZE_CODES,
  );
  numberAt(
    fieldAt(paperSize, 'widthPt', `${path}.paperSize`),
    `${path}.paperSize.widthPt`,
  );
  numberAt(
    fieldAt(paperSize, 'heightPt', `${path}.paperSize`),
    `${path}.paperSize.heightPt`,
  );
  enumAt(
    fieldAt(paperSize, 'orientation', `${path}.paperSize`),
    `${path}.paperSize.orientation`,
    V3_ORIENTATIONS,
  );

  positiveIntegerAt(
    fieldAt(object, 'testVersionNumber', path),
    `${path}.testVersionNumber`,
  );
  positiveIntegerAt(
    fieldAt(object, 'totalQuestions', path),
    `${path}.totalQuestions`,
  );
  const totalPages = positiveIntegerAt(
    fieldAt(object, 'totalPages', path),
    `${path}.totalPages`,
  );
  sha256At(fieldAt(object, 'manifestHash', path), `${path}.manifestHash`);
  nonEmptyStringAt(
    fieldAt(object, 'requiredScannerVersion', path),
    `${path}.requiredScannerVersion`,
  );
  instantAt(fieldAt(object, 'generatedAt', path), `${path}.generatedAt`);
  nullableAt(
    fieldAt(object, 'designSystem', path),
    `${path}.designSystem`,
    validateManifestDesignSystem,
  );

  const pages = arrayAt(fieldAt(object, 'pages', path), `${path}.pages`);
  if (pages.length !== totalPages) {
    fail(`${path}.pages`, `exactly ${totalPages} page entries`);
  }
  pages.forEach((page, index) => {
    const pagePath = `${path}.pages[${index}]`;
    validateManifestPage(page, pagePath);
    const pageObject = objectAt(page, pagePath);
    if (fieldAt(pageObject, 'totalPages', pagePath) !== totalPages) {
      fail(`${pagePath}.totalPages`, `${totalPages}`);
    }
  });
};

export const parseV3MobileReferenceDataEnvelope = (
  value: unknown,
): V3MobileReferenceDataEnvelope =>
  validateSuccessEnvelope(value, validateReferenceData);

export const parseV3MobileDownloadEnvelope = (
  value: unknown,
): V3MobileDownloadEnvelope => validateSuccessEnvelope(value, validateDownload);

export const parseV3AnswerSheetManifestEnvelope = (
  value: unknown,
): V3AnswerSheetManifestEnvelope =>
  validateSuccessEnvelope(value, validateManifest);
