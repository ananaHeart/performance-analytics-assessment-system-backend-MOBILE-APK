import {
  V3_REFERENCE_CACHE_AVAILABILITIES,
  deleteV3EvaluationReferenceCacheRow,
  getV3CaptureAvailability,
  getV3EvaluationReferenceCacheRow,
  saveV3EvaluationReferenceCacheRow,
} from '../../database/v3/evaluationReferenceCache';
import {getV3LocalCipher} from '../../native/v3SecureSession';
import type {V3EvaluationReference} from './dynamicVerificationClient';

const withoutAnswerKeys = (reference: V3EvaluationReference): V3EvaluationReference => ({
  ...reference,
  questions: reference.questions.map(question => ({
    ...question,
    correctOptionKey: null,
    acceptedAnswers: [],
  })),
});

/**
 * Keeps the last-fetched reference on the phone so rubric scoring and the
 * preliminary score work offline. Answer keys are only kept while the
 * assessment is open for capture, and only Android Keystore-encrypted; if the
 * installed native build can't encrypt, they're stripped before storing. This
 * copy is never used for uploads - those always fetch a fresh reference.
 */
export const cacheV3EvaluationReference = async (reference: V3EvaluationReference): Promise<void> => {
  const availability = getV3CaptureAvailability(reference.assignmentUuid);
  if (!V3_REFERENCE_CACHE_AVAILABILITIES.some(value => value === availability)) {
    deleteV3EvaluationReferenceCacheRow(reference.assignmentUuid);
    return;
  }
  const cipher = getV3LocalCipher();
  if (cipher) {
    saveV3EvaluationReferenceCacheRow(
      reference.assignmentUuid,
      await cipher.encrypt(JSON.stringify(reference)),
      true,
    );
  } else {
    saveV3EvaluationReferenceCacheRow(
      reference.assignmentUuid,
      JSON.stringify(withoutAnswerKeys(reference)),
      false,
    );
  }
};

export const loadCachedV3EvaluationReference = async (
  assignmentUuid: string,
): Promise<V3EvaluationReference | null> => {
  const row = getV3EvaluationReferenceCacheRow(assignmentUuid);
  if (!row) return null;
  if (!row.isEncrypted) return JSON.parse(row.referenceJson) as V3EvaluationReference;
  const cipher = getV3LocalCipher();
  if (!cipher) return null;
  try {
    return JSON.parse(await cipher.decrypt(row.referenceJson)) as V3EvaluationReference;
  } catch {
    // Keystore key lost (e.g. app data restored to another device) - the
    // ciphertext is unrecoverable, so drop it and re-fetch next time online.
    deleteV3EvaluationReferenceCacheRow(assignmentUuid);
    return null;
  }
};
