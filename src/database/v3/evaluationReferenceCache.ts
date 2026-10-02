import {getV3Database, v3NowIso, v3RowsToArray} from './database';

export interface V3EvaluationReferenceCacheRow {
  referenceJson: string;
  isEncrypted: boolean;
}

/** Capture availabilities during which scanning (and so the cache) is still needed. */
export const V3_REFERENCE_CACHE_AVAILABILITIES = ['open', 'late_allowed'] as const;

export const getV3CaptureAvailability = (assignmentUuid: string): string | null =>
  v3RowsToArray<{capture_availability: string}>(getV3Database().execute(
    'SELECT capture_availability FROM test_assignments WHERE assignment_uuid = ?',
    [assignmentUuid],
  ))[0]?.capture_availability ?? null;

export const saveV3EvaluationReferenceCacheRow = (
  assignmentUuid: string,
  referenceJson: string,
  isEncrypted: boolean,
): void => {
  getV3Database().execute(
    `INSERT INTO evaluation_reference_cache (assignment_uuid, reference_json, is_encrypted, cached_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (assignment_uuid) DO UPDATE SET
       reference_json = excluded.reference_json,
       is_encrypted = excluded.is_encrypted,
       cached_at = excluded.cached_at`,
    [assignmentUuid, referenceJson, isEncrypted ? 1 : 0, v3NowIso()],
  );
};

export const getV3EvaluationReferenceCacheRow = (
  assignmentUuid: string,
): V3EvaluationReferenceCacheRow | null => {
  const row = v3RowsToArray<{reference_json: string; is_encrypted: number}>(getV3Database().execute(
    'SELECT reference_json, is_encrypted FROM evaluation_reference_cache WHERE assignment_uuid = ?',
    [assignmentUuid],
  ))[0];
  return row ? {referenceJson: row.reference_json, isEncrypted: Number(row.is_encrypted) === 1} : null;
};

export const deleteV3EvaluationReferenceCacheRow = (assignmentUuid: string): void => {
  getV3Database().execute(
    'DELETE FROM evaluation_reference_cache WHERE assignment_uuid = ?',
    [assignmentUuid],
  );
};

/**
 * Drops the cached reference (and so any answer keys) for every assignment
 * that's no longer open for capture, or that has disappeared from the latest
 * download entirely.
 */
export const purgeClosedV3EvaluationReferenceCache = (): void => {
  getV3Database().execute(
    `DELETE FROM evaluation_reference_cache
      WHERE assignment_uuid NOT IN (
        SELECT assignment_uuid FROM test_assignments
         WHERE capture_availability IN ('open', 'late_allowed'))`,
  );
};
