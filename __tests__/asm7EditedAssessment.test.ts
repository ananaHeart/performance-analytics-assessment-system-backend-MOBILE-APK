import { isOutdatedAnswerSheetError } from '../src/services/v3/outdatedAnswerSheet';
import { refreshRescoredResults } from '../src/services/v3/rescoreRefresh';
import {
  getV3FinalizedDynamicResults,
  updateV3DynamicObjectiveOutbox,
} from '../src/database/v3/dynamicObjectiveRepository';

jest.mock('../src/database/v3/dynamicObjectiveRepository', () => ({
  getV3FinalizedDynamicResults: jest.fn(),
  updateV3DynamicObjectiveOutbox: jest.fn(),
}));
const mockGetResult = jest.fn();
jest.mock('../src/services/v3/objectiveClient', () => ({
  createV3ObjectiveClient: () => ({ getResult: mockGetResult }),
}));
jest.mock('../src/services/v3/diagnosticsConnection', () => ({ V3_BASE_URL: 'http://127.0.0.1:8080' }));

describe('ASM-7: editing an active assessment', () => {
  test('a deleted answer-sheet version is reported as outdated', () => {
    expect(isOutdatedAnswerSheetError({ status: 409, code: 'SCAN_CONTEXT_NOT_FOUND' })).toBe(true);
    expect(isOutdatedAnswerSheetError({ status: 404, code: null })).toBe(true);
    expect(isOutdatedAnswerSheetError({ status: 409, code: 'CAPTURE_NOT_ALLOWED' })).toBe(false);
    expect(isOutdatedAnswerSheetError({ status: 401, code: 'SESSION_IDLE_EXPIRED' })).toBe(false);
  });

  test('a result rescored on the server updates the phone; an unchanged one does not', async () => {
    jest.mocked(getV3FinalizedDynamicResults).mockReturnValue([
      { resultUuid: 'rescored', expectedRevision: 5 },
      { resultUuid: 'unchanged', expectedRevision: 3 },
    ] as never);
    const newScore = { totalScore: 18, maxScore: 20, percentage: 90 };
    mockGetResult.mockImplementation(async (uuid: string) => (uuid === 'rescored'
      ? { revision: 6, officialScore: newScore }
      : { revision: 3, officialScore: { totalScore: 10, maxScore: 20, percentage: 50 } }));

    await expect(refreshRescoredResults(1, 'token')).resolves.toBe(true);

    expect(updateV3DynamicObjectiveOutbox).toHaveBeenCalledTimes(1);
    expect(updateV3DynamicObjectiveOutbox).toHaveBeenCalledWith('rescored', {
      expectedRevision: 6,
      officialScore: newScore,
    });
  });
});
