import { deleteScanFiles, sweepUnusedScanFiles } from '../src/services/v3/scanStorageCleanup';
import { getV3DynamicScanFilesInUse } from '../src/database/v3/dynamicObjectiveRepository';
import { deleteDynamicScanFiles, listDynamicScanFiles } from '../src/native/omrScanner';

jest.mock('../src/database/v3/dynamicObjectiveRepository', () => ({
  getV3DynamicScanFilesInUse: jest.fn(),
}));
jest.mock('../src/native/omrScanner', () => ({
  listDynamicScanFiles: jest.fn(),
  deleteDynamicScanFiles: jest.fn(async (uris: string[]) => uris.length * 1000),
}));

const ROOT = 'file:///storage/emulated/0/Android/data/com.mobileassessmentapp/files/Pictures/omr_scans';

describe('scan storage cleanup', () => {
  beforeEach(() => jest.clearAllMocks());

  test('deletes only scans that no unsent result needs', async () => {
    // An unsent result still refers to files inside dynamic_200 (its upload copy and a crop).
    jest.mocked(getV3DynamicScanFilesInUse).mockReturnValue([
      `${ROOT}/dynamic_200/page-01-upload.jpg`,
      `${ROOT}/dynamic_200/page-01-question-013-enumeration.png`,
    ]);
    jest.mocked(listDynamicScanFiles).mockResolvedValue([
      { uri: `${ROOT}/dynamic_100`, bytes: 5_000_000 }, // finalized or discarded
      { uri: `${ROOT}/dynamic_200`, bytes: 3_000_000 }, // still unsent: keep
      { uri: `${ROOT}/omr_dynamic_camera_150.jpg`, bytes: 2_400_000 }, // leftover raw photo
    ]);

    await sweepUnusedScanFiles();

    expect(deleteDynamicScanFiles).toHaveBeenCalledWith([
      `${ROOT}/dynamic_100`,
      `${ROOT}/omr_dynamic_camera_150.jpg`,
    ]);
  });

  test('keeps an old unsent result whose page image is the raw photo', async () => {
    jest.mocked(getV3DynamicScanFilesInUse).mockReturnValue([`${ROOT}/omr_dynamic_camera_150.jpg`]);
    jest.mocked(listDynamicScanFiles).mockResolvedValue([
      { uri: `${ROOT}/omr_dynamic_camera_150.jpg`, bytes: 2_400_000 },
    ]);

    await sweepUnusedScanFiles();

    expect(deleteDynamicScanFiles).not.toHaveBeenCalled();
  });

  test('a cleanup failure never becomes an error for the teacher', async () => {
    jest.mocked(getV3DynamicScanFilesInUse).mockReturnValue([]);
    jest.mocked(listDynamicScanFiles).mockRejectedValue(new Error('storage unavailable'));
    await expect(sweepUnusedScanFiles()).resolves.toBe(0);

    jest.mocked(deleteDynamicScanFiles).mockRejectedValueOnce(new Error('busy'));
    await expect(deleteScanFiles([`${ROOT}/dynamic_100/page-01-upload.jpg`])).resolves.toBe(0);
  });
});
