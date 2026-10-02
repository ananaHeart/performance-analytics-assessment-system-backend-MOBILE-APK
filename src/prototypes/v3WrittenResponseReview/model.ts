export const V3_WRITTEN_RESPONSE_TYPES = [
  'identification',
  'enumeration',
  'essay',
] as const;

export type V3WrittenResponseType = (typeof V3_WRITTEN_RESPONSE_TYPES)[number];
export type V3WrittenReviewStatus = 'pending' | 'verified';
export type V3WrittenScoreMode = 'numeric' | 'rubric';
export type V3WrittenAuditAction = 'pending_saved' | 'verified' | 'reopened';

export interface V3WrittenResponseEvidence {
  readonly regionUuid: string;
  readonly scanPageUuid: string;
  readonly imageUri: string;
  readonly imageSha256: string;
  readonly capturedAt: string;
}

export interface V3RubricCriterion {
  readonly criterionId: string;
  readonly name: string;
  readonly description: string | null;
  readonly maximumPoints: number;
}

export interface V3EssayRubric {
  readonly rubricId: number;
  readonly title: string;
  readonly criteria: readonly V3RubricCriterion[];
}

export interface V3WrittenReviewAuditEvent {
  readonly eventUuid: string;
  readonly action: V3WrittenAuditAction;
  readonly teacherUserId: number;
  readonly occurredAt: string;
  readonly reason: string | null;
  readonly scoreSnapshot: number | null;
  readonly revision: number;
}

export interface V3WrittenResponseReview {
  readonly answerUuid: string;
  readonly questionId: number;
  readonly itemNumber: number;
  readonly questionType: V3WrittenResponseType;
  readonly maximumPoints: number;
  readonly evidence: Readonly<V3WrittenResponseEvidence>;
  readonly rubric: Readonly<V3EssayRubric> | null;
  readonly scoreMode: V3WrittenScoreMode;
  readonly numericScore: number | null;
  readonly criterionScores: Readonly<Record<string, number | null>>;
  readonly teacherComment: string;
  readonly status: V3WrittenReviewStatus;
  readonly revision: number;
  readonly verifiedByUserId: number | null;
  readonly verifiedAt: string | null;
  readonly auditTrail: readonly V3WrittenReviewAuditEvent[];
}

export interface CreateV3WrittenReviewInput {
  answerUuid: string;
  questionId: number;
  itemNumber: number;
  questionType: V3WrittenResponseType;
  maximumPoints: number;
  evidence: V3WrittenResponseEvidence;
  rubric?: V3EssayRubric | null;
}

export interface V3WrittenAuditContext {
  eventUuid: string;
  teacherUserId: number;
  occurredAt: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a canonical lowercase UUID.`);
  }
};

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
};

const assertScore = (value: number, maximum: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${field} must be between 0 and ${maximum}.`);
  }
};

const assertUtcInstant = (value: string, field: string): void => {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a UTC ISO-8601 timestamp.`);
  }
};

const assertEditable = (review: V3WrittenResponseReview): void => {
  if (review.status === 'verified') {
    throw new Error('Verified scoring must be reopened before it can change.');
  }
};

const freezeRubric = (
  rubric: V3EssayRubric | null | undefined,
  questionType: V3WrittenResponseType,
): Readonly<V3EssayRubric> | null => {
  if (!rubric) {
    return null;
  }
  if (questionType !== 'essay') {
    throw new Error('Only Essay may use a rubric in this prototype.');
  }
  assertPositiveInteger(rubric.rubricId, 'rubricId');
  if (rubric.title.trim().length === 0 || rubric.criteria.length === 0) {
    throw new Error('A rubric requires a title and at least one criterion.');
  }

  const criterionIds = new Set<string>();
  const criteria = rubric.criteria.map(criterion => {
    if (criterion.criterionId.trim().length === 0) {
      throw new Error('criterionId must not be blank.');
    }
    if (criterionIds.has(criterion.criterionId)) {
      throw new Error(`Duplicate rubric criterion: ${criterion.criterionId}.`);
    }
    criterionIds.add(criterion.criterionId);
    if (criterion.name.trim().length === 0) {
      throw new Error('Rubric criterion name must not be blank.');
    }
    if (
      !Number.isFinite(criterion.maximumPoints) ||
      criterion.maximumPoints <= 0
    ) {
      throw new Error('Rubric criterion maximumPoints must be greater than 0.');
    }
    return Object.freeze({ ...criterion });
  });

  return Object.freeze({ ...rubric, criteria: Object.freeze(criteria) });
};

const freezeReview = (
  review: V3WrittenResponseReview,
): V3WrittenResponseReview =>
  Object.freeze({
    ...review,
    evidence: Object.freeze({ ...review.evidence }),
    criterionScores: Object.freeze({ ...review.criterionScores }),
    auditTrail: Object.freeze([...review.auditTrail]),
  });

export const createV3WrittenResponseReview = (
  input: CreateV3WrittenReviewInput,
): V3WrittenResponseReview => {
  assertUuid(input.answerUuid, 'answerUuid');
  assertPositiveInteger(input.questionId, 'questionId');
  assertPositiveInteger(input.itemNumber, 'itemNumber');
  if (!V3_WRITTEN_RESPONSE_TYPES.includes(input.questionType)) {
    throw new Error('Unsupported written response type.');
  }
  if (!Number.isFinite(input.maximumPoints) || input.maximumPoints <= 0) {
    throw new Error('maximumPoints must be greater than 0.');
  }

  assertUuid(input.evidence.regionUuid, 'evidence.regionUuid');
  assertUuid(input.evidence.scanPageUuid, 'evidence.scanPageUuid');
  if (input.evidence.imageUri.trim().length === 0) {
    throw new Error('evidence.imageUri must not be blank.');
  }
  if (!SHA256_PATTERN.test(input.evidence.imageSha256)) {
    throw new Error('evidence.imageSha256 must be a lowercase SHA-256 hash.');
  }
  assertUtcInstant(input.evidence.capturedAt, 'evidence.capturedAt');

  const rubric = freezeRubric(input.rubric, input.questionType);
  const criterionScores = Object.fromEntries(
    rubric?.criteria.map(criterion => [criterion.criterionId, null]) ?? [],
  );

  return freezeReview({
    answerUuid: input.answerUuid,
    questionId: input.questionId,
    itemNumber: input.itemNumber,
    questionType: input.questionType,
    maximumPoints: input.maximumPoints,
    evidence: input.evidence,
    rubric,
    scoreMode: rubric ? 'rubric' : 'numeric',
    numericScore: null,
    criterionScores,
    teacherComment: '',
    status: 'pending',
    revision: 1,
    verifiedByUserId: null,
    verifiedAt: null,
    auditTrail: [],
  });
};

export const calculateV3WrittenReviewScore = (
  review: V3WrittenResponseReview,
): number | null => {
  if (review.scoreMode === 'numeric') {
    return review.numericScore;
  }

  const scores = Object.values(review.criterionScores);
  if (scores.every(score => score === null)) {
    return null;
  }
  const total = scores.reduce<number>(
    (sum, score) => sum + (score === null ? 0 : score),
    0,
  );
  return Math.min(total, review.maximumPoints);
};

export const isV3WrittenReviewComplete = (
  review: V3WrittenResponseReview,
): boolean => {
  if (review.scoreMode === 'numeric') {
    return review.numericScore !== null;
  }
  return Object.values(review.criterionScores).every(score => score !== null);
};

export const setV3WrittenNumericScore = (
  review: V3WrittenResponseReview,
  score: number | null,
): V3WrittenResponseReview => {
  assertEditable(review);
  if (review.scoreMode !== 'numeric') {
    throw new Error(
      'Numeric fallback is unavailable while a rubric is assigned.',
    );
  }
  if (score !== null) {
    assertScore(score, review.maximumPoints, 'score');
  }
  return freezeReview({ ...review, numericScore: score });
};

export const setV3WrittenCriterionScore = (
  review: V3WrittenResponseReview,
  criterionId: string,
  score: number | null,
): V3WrittenResponseReview => {
  assertEditable(review);
  if (review.scoreMode !== 'rubric' || !review.rubric) {
    throw new Error('Criterion scoring requires an assigned rubric.');
  }
  const criterion = review.rubric.criteria.find(
    candidate => candidate.criterionId === criterionId,
  );
  if (!criterion) {
    throw new Error(`Unknown rubric criterion: ${criterionId}.`);
  }
  if (score !== null) {
    assertScore(score, criterion.maximumPoints, 'criterion score');
  }
  return freezeReview({
    ...review,
    criterionScores: { ...review.criterionScores, [criterionId]: score },
  });
};

export const setV3WrittenTeacherComment = (
  review: V3WrittenResponseReview,
  teacherComment: string,
): V3WrittenResponseReview => {
  assertEditable(review);
  return freezeReview({ ...review, teacherComment });
};

const assertAuditContext = (context: V3WrittenAuditContext): void => {
  assertUuid(context.eventUuid, 'eventUuid');
  assertPositiveInteger(context.teacherUserId, 'teacherUserId');
  assertUtcInstant(context.occurredAt, 'occurredAt');
};

const appendAuditEvent = (
  review: V3WrittenResponseReview,
  context: V3WrittenAuditContext,
  action: V3WrittenAuditAction,
  reason: string | null,
): readonly V3WrittenReviewAuditEvent[] => {
  assertAuditContext(context);
  if (review.auditTrail.some(event => event.eventUuid === context.eventUuid)) {
    throw new Error('Audit event UUID has already been used.');
  }
  return [
    ...review.auditTrail,
    Object.freeze({
      eventUuid: context.eventUuid,
      action,
      teacherUserId: context.teacherUserId,
      occurredAt: context.occurredAt,
      reason,
      scoreSnapshot: calculateV3WrittenReviewScore(review),
      revision: review.revision,
    }),
  ];
};

export const saveV3WrittenReviewPending = (
  review: V3WrittenResponseReview,
  context: V3WrittenAuditContext,
): V3WrittenResponseReview => {
  assertEditable(review);
  return freezeReview({
    ...review,
    auditTrail: appendAuditEvent(review, context, 'pending_saved', null),
  });
};

export const verifyV3WrittenReview = (
  review: V3WrittenResponseReview,
  context: V3WrittenAuditContext,
): V3WrittenResponseReview => {
  assertEditable(review);
  if (!isV3WrittenReviewComplete(review)) {
    throw new Error(
      'Every required score must be completed before verification.',
    );
  }
  const auditTrail = appendAuditEvent(review, context, 'verified', null);
  return freezeReview({
    ...review,
    status: 'verified',
    revision: review.revision + 1,
    verifiedByUserId: context.teacherUserId,
    verifiedAt: context.occurredAt,
    auditTrail,
  });
};

export const reopenV3WrittenReview = (
  review: V3WrittenResponseReview,
  context: V3WrittenAuditContext,
  reason: string,
): V3WrittenResponseReview => {
  if (review.status !== 'verified') {
    throw new Error('Only a verified review can be reopened.');
  }
  const normalizedReason = reason.trim();
  if (normalizedReason.length === 0) {
    throw new Error('A correction reason is required to reopen scoring.');
  }
  const auditTrail = appendAuditEvent(
    review,
    context,
    'reopened',
    normalizedReason,
  );
  return freezeReview({
    ...review,
    status: 'pending',
    revision: review.revision + 1,
    verifiedByUserId: null,
    verifiedAt: null,
    auditTrail,
  });
};
