/**
 * V3 mobile clients for the dynamic (mixed-question-type) written-response
 * verification path: the evaluation-reference read (`GET .../evaluation-reference`)
 * and the 3.1 written verification-batch write, matched against the actual
 * backend source (not guessed):
 * - com.capstone.assessment.v3.mobile.controller.V3EvaluationReferenceController
 * - com.capstone.assessment.v3.mobile.dto.V3EvaluationReference
 * - com.capstone.assessment.v3.mobile.dto.V3WrittenVerificationBatch
 * - com.capstone.assessment.v3.mobile.service.V3WrittenVerificationService
 *
 * Both routes are release-gated the same way as the rest of the objective
 * upload chain in objectiveClient.ts.
 *
 * IMPORTANT: `Item.evaluationReferenceHash`/`testVersionNumber` are checked
 * server-side against a freshly locked evaluation reference
 * (V3WrittenVerificationService.verify(), calls references.lockedForVerification()).
 * They cannot be cached or computed client-side - always fetch a fresh
 * V3EvaluationReference immediately before building a written verification batch,
 * and use exactly the hash/version it returns.
 */

import { v3Fetch } from './coldStartFetch';

export interface V3EvaluationReferenceAcceptedAnswer {
  text: string;
  matchingMode: string;
  caseSensitive: boolean;
  points: number;
}

// Fields marked "3.1" are absent from a contract 3.0 response.
export interface V3EvaluationReferenceQuestion {
  questionUuid: string;
  maximumPoints: number;
  rubricId: number | null;
  expectedResponseCount: number | null;
  /** 3.1 */
  questionType?: string;
  /** 3.1. MC/TF only: the correct option's storedValue (T/F uses "A"/"B"). */
  correctOptionKey?: string | null;
  /** 3.1. Identification/enumeration only. Display-only on mobile. */
  acceptedAnswers?: V3EvaluationReferenceAcceptedAnswer[];
}

export interface V3EvaluationReferenceRubricCriterion {
  rubricCriterionId: number;
  name: string;
  maximumPoints: number;
  isRequired: boolean;
  /** 3.1 */
  description?: string;
}

export interface V3EvaluationReferenceRubric {
  rubricId: number;
  name: string;
  criteria: V3EvaluationReferenceRubricCriterion[];
}

export interface V3EvaluationReference {
  contractVersion: string;
  assignmentUuid: string;
  testVersionNumber: number;
  evaluationReferenceHash: string;
  questions: V3EvaluationReferenceQuestion[];
  rubrics: V3EvaluationReferenceRubric[];
}

export interface V3WrittenPageDecision {
  verificationUuid: string;
  scanPageUuid: string;
  action: 'accepted';
  reasonCode: null;
  comment: null;
  clientDecidedAt: string;
}

/**
 * Matches V3WrittenVerificationBatch.Manual exactly. Used for identification and
 * enumeration (and essay questions with no rubric assigned): a plain binary
 * Right/Wrong tap resolved into `points` client-side (Right -> the question's
 * maximumPoints from the fresh evaluation reference, Wrong -> 0).
 */
export interface V3WrittenManualEvaluation {
  kind: 'manual';
  answerStatus: 'answered' | 'blank';
  responseText: string | null;
  attachmentUuids: string[];
  points: number;
}

/**
 * Matches V3WrittenVerificationBatch.Rubric exactly (V3WrittenVerificationBatch.java:41-48).
 * Mandatory whenever the question's evaluation-reference entry has a non-null
 * rubricId - submitting Manual for such a question is a hard server-side reject
 * (RUBRIC_REQUIRED, V3WrittenVerificationService.java:126), not a fallback choice.
 * There is no client-computed total: the backend independently sums
 * criterionScores[].pointsAwarded from scratch and rejects the whole batch item
 * if the count of scores doesn't exactly match the rubric's criterion count
 * (every criterion needs a score, not just ones with isRequired=true), if any
 * rubricCriterionId is duplicated or foreign to the assigned rubric, if any
 * single pointsAwarded exceeds that criterion's own maximumPoints, or if the
 * summed total exceeds the question's maximumPoints.
 */
export interface V3WrittenRubricCriterionScore {
  rubricCriterionId: number;
  pointsAwarded: number;
  comment: string | null;
}

export interface V3WrittenRubricEvaluation {
  kind: 'rubric';
  answerStatus: 'answered' | 'blank';
  responseText: string | null;
  attachmentUuids: string[];
  rubricId: number;
  criterionScores: V3WrittenRubricCriterionScore[];
}

export type V3WrittenEvaluation = V3WrittenManualEvaluation | V3WrittenRubricEvaluation;

export interface V3WrittenAnswer {
  answerUuid: string;
  verificationUuid: string;
  questionUuid: string;
  regionUuid: string;
  scanPageUuid: string;
  evaluation: V3WrittenEvaluation;
  comment: string | null;
  clientDecidedAt: string;
}

export interface V3WrittenVerificationBatchRequest {
  contractVersion: '3.1';
  syncUuid: string;
  operationUuid: string;
  assignmentUuid: string;
  items: Array<{
    resultUuid: string;
    expectedRevision: number;
    testVersionNumber: number;
    evaluationReferenceHash: string;
    pageDecisions: V3WrittenPageDecision[];
    answers: V3WrittenAnswer[];
  }>;
}

export interface V3WrittenVerificationOutcome {
  resultUuid: string;
  status: string;
  disposition: string;
  revision: number | null;
  error: {code: string; message: string; retryable: boolean} | null;
}

export interface V3WrittenVerificationResponse {
  syncUuid: string;
  operationUuid: string;
  status: string;
  items: V3WrittenVerificationOutcome[];
}

export class V3DynamicVerificationHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'V3DynamicVerificationHttpError';
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: {code?: string} | null;
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.success || body.data == null) {
    throw new V3DynamicVerificationHttpError(
      response.status,
      body?.errors?.code ?? null,
      body?.message || `V3 written verification request failed with status ${response.status}.`,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  return body.data;
};

const jsonHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  // getEvaluationReference must never be served a cached body (see its call
  // site's own comment) - without this, Android's HTTP client can silently
  // return a stale cached response for a GET to the same URL.
  'Cache-Control': 'no-cache',
});

export const createV3DynamicVerificationClient = (baseUrl: string, accessToken: string) => {
  const origin = baseUrl.replace(/\/+$/, '');
  const token = accessToken.trim();
  if (!token) throw new Error('A V3 session is required for written verification.');

  return {
    getEvaluationReference: async (assignmentUuid: string) =>
      parseResponse<V3EvaluationReference>(await v3Fetch(
        `${origin}/api/v3/mobile/test-assignments/${assignmentUuid}/evaluation-reference`,
        {headers: jsonHeaders(token)},
      )),
    submitWrittenVerificationBatch: async (request: V3WrittenVerificationBatchRequest) =>
      parseResponse<V3WrittenVerificationResponse>(await v3Fetch(
        `${origin}/api/v3/mobile/verification-batches`,
        {method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(request)},
      )),
  };
};
