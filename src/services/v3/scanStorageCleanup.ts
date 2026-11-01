import {getV3DynamicScanFilesInUse} from '../../database/v3/dynamicObjectiveRepository';
import {deleteDynamicScanFiles, listDynamicScanFiles} from '../../native/omrScanner';

/**
 * Frees phone storage taken by scan files that have no further use: results
 * already sent (finalized), and scans that were discarded or never saved.
 * Files of a result that is not yet finalized are never deleted - they are
 * what gets sent. Cleanup is best-effort: a failure only means the space is
 * freed on a later run, never an error for the teacher.
 */

// The scan "entry" a file belongs to: its dynamic_<time> folder, or the raw
// photo itself when it sits directly in omr_scans.
const scanEntryName = (uri: string): string => {
  const parts = uri.split('/').filter(Boolean);
  const parent = parts[parts.length - 2] ?? '';
  return parent.startsWith('dynamic_') ? parent : parts[parts.length - 1] ?? uri;
};

/** Deletes the scan folders the given files belong to. Resolves with bytes freed. */
export const deleteScanFiles = async (uris: string[]): Promise<number> => {
  const targets = uris.filter(Boolean);
  if (targets.length === 0) return 0;
  try {
    return await deleteDynamicScanFiles(targets);
  } catch {
    return 0;
  }
};

/** Deletes every dynamic scan entry that no unsent result still needs. */
export const sweepUnusedScanFiles = async (): Promise<number> => {
  try {
    const inUse = new Set(getV3DynamicScanFilesInUse().map(scanEntryName));
    const unused = (await listDynamicScanFiles())
      .filter(entry => !inUse.has(scanEntryName(entry.uri)));
    return unused.length > 0 ? await deleteDynamicScanFiles(unused.map(entry => entry.uri)) : 0;
  } catch {
    return 0;
  }
};
