import {
  getV3FinalizedDynamicResults,
  updateV3DynamicObjectiveOutbox,
} from '../../database/v3/dynamicObjectiveRepository';
import {createV3ObjectiveClient} from './objectiveClient';
import {V3_BASE_URL} from './diagnosticsConnection';

/**
 * ASM-7: when the teacher corrects an answer key after results were sent, the
 * server rescores them (new revision, updated official score). Re-reads each
 * finalized result of one assessment and keeps the phone's copy in step.
 * Resolves true when any score changed.
 */
export const refreshRescoredResults = async (
  testAssignmentId: number,
  accessToken: string,
): Promise<boolean> => {
  const client = createV3ObjectiveClient(V3_BASE_URL, accessToken);
  let changed = false;
  for (const record of getV3FinalizedDynamicResults(testAssignmentId)) {
    const readback = await client.getResult(record.resultUuid);
    if (!readback.officialScore || readback.revision === record.expectedRevision) continue;
    updateV3DynamicObjectiveOutbox(record.resultUuid, {
      expectedRevision: readback.revision,
      officialScore: readback.officialScore,
    });
    changed = true;
  }
  return changed;
};
