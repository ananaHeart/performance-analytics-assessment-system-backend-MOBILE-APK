import { initV3Database } from '../src/database/v3/database';
import { saveV3MobileDownload } from '../src/database/v3/downloadRepository';
import { saveV3AnswerSheetManifest } from '../src/database/v3/manifestRepository';
import { saveV3ReferenceData } from '../src/database/v3/referenceDataRepository';
import type { V3MobileReadClient } from '../src/services/v3/mobileReadClient';
import { createV3OfflineDataService } from '../src/services/v3/offlineDataService';

jest.mock('../src/database/v3/database', () => ({
  initV3Database: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/database/v3/referenceDataRepository', () => ({
  saveV3ReferenceData: jest.fn().mockResolvedValue({ refreshedAt: 'now' }),
}));
jest.mock('../src/database/v3/downloadRepository', () => ({
  saveV3MobileDownload: jest.fn().mockResolvedValue({ replayed: false }),
}));
jest.mock('../src/database/v3/manifestRepository', () => ({
  saveV3AnswerSheetManifest: jest.fn().mockResolvedValue({ replayed: false }),
}));

const ASSIGNMENT_UUID = '26b14ea2-4383-43f5-bb40-f60683ee46bb';
const FIRST_SHEET_UUID = '56d628da-d7fc-4faa-b018-3f740e048bf0';
const SECOND_SHEET_UUID = '68e739eb-e8ad-4fbb-a129-4a851f159cf1';

describe('V3 offline data service', () => {
  beforeEach(() => jest.clearAllMocks());

  test('downloads reference data, the full snapshot, and every available manifest', async () => {
    const referenceEnvelope = { data: { contractVersion: '3.0' } };
    const downloadEnvelope = {
      data: {
        answerSheets: [
          { assignmentUuid: ASSIGNMENT_UUID, answerSheetUuid: FIRST_SHEET_UUID },
          { assignmentUuid: ASSIGNMENT_UUID, answerSheetUuid: SECOND_SHEET_UUID },
        ],
      },
    };
    const manifestEnvelopes = [
      { data: { answerSheetUuid: FIRST_SHEET_UUID } },
      { data: { answerSheetUuid: SECOND_SHEET_UUID } },
    ];
    const client = {
      getReferenceData: jest.fn().mockResolvedValue(referenceEnvelope),
      getDownload: jest.fn().mockResolvedValue(downloadEnvelope),
      getAnswerSheetManifest: jest
        .fn()
        .mockResolvedValueOnce(manifestEnvelopes[0])
        .mockResolvedValueOnce(manifestEnvelopes[1]),
    } as unknown as V3MobileReadClient;

    const result = await createV3OfflineDataService(client).refreshOfflineBaseline();

    expect(initV3Database).toHaveBeenCalledTimes(1);
    expect(saveV3ReferenceData).toHaveBeenCalledWith(referenceEnvelope.data);
    expect(saveV3MobileDownload).toHaveBeenCalledWith(downloadEnvelope.data);
    expect(client.getAnswerSheetManifest).toHaveBeenNthCalledWith(
      1,
      ASSIGNMENT_UUID,
      FIRST_SHEET_UUID,
      undefined,
    );
    expect(client.getAnswerSheetManifest).toHaveBeenNthCalledWith(
      2,
      ASSIGNMENT_UUID,
      SECOND_SHEET_UUID,
      undefined,
    );
    expect(saveV3AnswerSheetManifest).toHaveBeenCalledTimes(2);
    expect(result.manifests).toHaveLength(2);
  });
});
