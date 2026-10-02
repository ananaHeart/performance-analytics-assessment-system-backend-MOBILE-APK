import { open, type QueryResult, type QuickSQLiteConnection } from 'react-native-quick-sqlite';

import { getSyncUploadUrl } from '../config/api';

const db: QuickSQLiteConnection = open({ name: 'AssessmentStorage.db' });

interface LocalTestResultRow {
  test_result_id: number;
  local_result_id: string;
  test_id: number;
  student_id: number;
  total_score: number | null;
  raw_answers: string | null;
  updated_at: string | null;
}

interface LocalItemResponseRow {
  response_id: number;
  local_response_id: string;
  local_result_id: string;
  test_part_id: number;
  item_number: number;
  is_correct: number;
  updated_at: string | null;
}

interface LocalTestPartScoreRow {
  number_of_items: number | null;
  points_per_item: number | null;
  answer_key: string | null;
}

export interface UploadTestResultDto {
  localResultId: string;
  testId: number;
  studentId: number;
  totalScore: number;
  maxScore: number;
  rawAnswers: string;
  checkedAt: string | null;
}

export interface UploadItemResponseDto {
  localResponseId: string;
  localResultId: string;
  testPartId: number;
  itemNumber: number;
  isCorrect: boolean;
  updatedAt: string | null;
}

export interface UploadSyncPayload {
  teacherId: number;
  testId: number;
  uploadedAt: string;
  testResults: UploadTestResultDto[];
  itemResponses: UploadItemResponseDto[];
}

export interface UploadSyncSummary {
  uploadedResults: number;
  uploadedItems: number;
  duplicateResults: number;
  duplicateItems: number;
}

export interface UploadSyncResponse {
  status?: string;
  uploadedResults?: number;
  uploadedItems?: number;
  message?: string;
  [key: string]: unknown;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, unknown> | null;
  timestamp?: string;
}

const mapRows = <T>(result: QueryResult): T[] => {
  return (result.rows?._array ?? []) as T[];
};

const toIsoWithLocalOffset = (date = new Date()): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const offsetRemainderMinutes = String(absoluteOffset % 60).padStart(2, '0');
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return `${localDate.toISOString().slice(0, 19)}${sign}${offsetHours}:${offsetRemainderMinutes}`;
};

const countAnswerKeyItems = (answerKey: string | null): number => {
  if (!answerKey || typeof answerKey !== 'string') {
    return 0;
  }

  return answerKey
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean).length;
};

const getMaxScoreForTest = (testId: number): number => {
  const rows = mapRows<LocalTestPartScoreRow>(
    db.execute(
      `SELECT number_of_items, points_per_item, answer_key
       FROM test_parts
       WHERE test_id = ?`,
      [testId],
    ),
  );

  return rows.reduce((total, row) => {
    const declaredItems = Number(row.number_of_items ?? 0);
    const answerKeyItems = countAnswerKeyItems(row.answer_key);
    const itemCount = Math.max(declaredItems, answerKeyItems);
    const pointsPerItem = Number(row.points_per_item ?? 1) || 1;

    return total + (itemCount * pointsPerItem);
  }, 0);
};

const getAllUnsyncedTestResults = (teacherId: number): LocalTestResultRow[] => {
  return mapRows<LocalTestResultRow>(
    db.execute(
      `SELECT
         tr.test_result_id,
         tr.local_result_id,
         tr.test_id,
         tr.student_id,
         tr.total_score,
         tr.raw_answers,
         tr.updated_at
       FROM test_results tr
       JOIN tests t ON t.test_id = tr.test_id
       JOIN classes c ON c.class_id = t.class_id
       WHERE c.teacher_id = ?
         AND tr.is_synced = 0
       ORDER BY tr.test_result_id`,
      [teacherId],
    ),
  );
};

const getUnsyncedTestResultsForTest = (teacherId: number, testId: number): LocalTestResultRow[] => {
  return mapRows<LocalTestResultRow>(
    db.execute(
      `SELECT
         tr.test_result_id,
         tr.local_result_id,
         tr.test_id,
         tr.student_id,
         tr.total_score,
         tr.raw_answers,
         tr.updated_at
       FROM test_results tr
       JOIN tests t ON t.test_id = tr.test_id
       JOIN classes c ON c.class_id = t.class_id
       WHERE c.teacher_id = ?
         AND tr.test_id = ?
         AND tr.is_synced = 0
       ORDER BY tr.test_result_id`,
      [teacherId, testId],
    ),
  );
};

const getAllUnsyncedItemResponses = (): LocalItemResponseRow[] => {
  return mapRows<LocalItemResponseRow>(
    db.execute(
      `SELECT
         ir.response_id,
         ir.local_response_id,
         ir.local_result_id,
         ir.test_part_id,
         ir.item_number,
         ir.is_correct,
         ir.updated_at
       FROM item_responses ir
       JOIN test_results tr ON tr.local_result_id = ir.local_result_id
       WHERE ir.is_synced = 0
       ORDER BY ir.response_id`,
    ),
  );
};

const getUnsyncedItemResponsesForLocalResults = (localResultIds: string[]): LocalItemResponseRow[] => {
  if (localResultIds.length === 0) {
    return [];
  }

  const placeholders = localResultIds.map(() => '?').join(', ');

  return mapRows<LocalItemResponseRow>(
    db.execute(
      `SELECT
         response_id,
         local_response_id,
         local_result_id,
         test_part_id,
         item_number,
         is_correct,
         updated_at
       FROM item_responses
       WHERE is_synced = 0
         AND local_result_id IN (${placeholders})
       ORDER BY response_id`,
      localResultIds,
    ),
  );
};

const mapUploadPayload = (
  teacherId: number,
  testId: number,
  testResults: LocalTestResultRow[],
  itemResponses: LocalItemResponseRow[],
): UploadSyncPayload => {
  const selectedTestResults = testResults.filter((row) => row.test_id === testId);
  const selectedLocalResultIds = new Set(selectedTestResults.map((row) => row.local_result_id));
  const uploadedAt = toIsoWithLocalOffset();
  const maxScore = getMaxScoreForTest(testId);

  return {
    teacherId,
    testId,
    uploadedAt,
    testResults: selectedTestResults.map((row) => ({
        localResultId: row.local_result_id,
        testId: row.test_id,
        studentId: row.student_id,
        totalScore: row.total_score ?? 0,
        maxScore,
        rawAnswers: row.raw_answers ?? '',
        checkedAt: row.updated_at ?? null,
      })),
    itemResponses: itemResponses
      .filter((row) => selectedLocalResultIds.has(row.local_result_id))
      .map((row) => ({
        localResponseId: row.local_response_id,
        localResultId: row.local_result_id,
        testPartId: row.test_part_id,
        itemNumber: row.item_number,
        isCorrect: row.is_correct === 1,
        updatedAt: row.updated_at ?? null,
      })),
  };
};

const buildSummary = (payload: UploadSyncPayload, responseData?: UploadSyncResponse): UploadSyncSummary => {
  const uploadedResults = Number(responseData?.uploadedResults ?? 0);
  const uploadedItems = Number(responseData?.uploadedItems ?? 0);

  return {
    uploadedResults,
    uploadedItems,
    duplicateResults: Math.max(0, payload.testResults.length - uploadedResults),
    duplicateItems: Math.max(0, payload.itemResponses.length - uploadedItems),
  };
};

export const getUnsyncedResults = (teacherId: number): UploadSyncPayload | null => {
  const testResults = getAllUnsyncedTestResults(teacherId);
  const itemResponses = getAllUnsyncedItemResponses();

  if (testResults.length === 0 && itemResponses.length === 0) {
    return null;
  }

  const uniqueTestIds = Array.from(new Set(testResults.map((row) => row.test_id)));
  if (uniqueTestIds.length !== 1) {
    throw new Error('Global unsynced payload spans multiple tests.');
  }

  const testId = uniqueTestIds[0];
  return mapUploadPayload(0, testId, testResults, itemResponses);
};

export const markAsSynced = async (payload: UploadSyncPayload): Promise<void> => {
  const testResultIds = payload.testResults.map((result) => result.localResultId);
  const itemResponseIds = payload.itemResponses.map((response) => response.localResponseId);

  await db.transaction((tx) => {
    testResultIds.forEach((localResultId) => {
      tx.execute(
        'UPDATE test_results SET is_synced = 1 WHERE local_result_id = ?',
        [localResultId],
      );
    });

    itemResponseIds.forEach((localResponseId) => {
      tx.execute(
        'UPDATE item_responses SET is_synced = 1 WHERE local_response_id = ?',
        [localResponseId],
      );
    });
  });
};

type SyncUploadResult = {
  success: boolean;
  payload?: UploadSyncPayload;
  response?: UploadSyncResponse;
  summary?: UploadSyncSummary;
  noData?: boolean;
  inProgress?: boolean;
  error?: string;
};

let uploadInProgress = false;

const performSyncToServer = async (
  teacherId: number,
  testId: number,
): Promise<SyncUploadResult> => {
  try {
    if (teacherId == null) {
      throw new Error('teacherId is required for sync upload.');
    }

    if (testId == null) {
      throw new Error('testId is required for current-test upload.');
    }

    const localTestResults = getUnsyncedTestResultsForTest(teacherId, testId);
    if (localTestResults.length === 0) {
      return {
        success: true,
        noData: true,
        response: { status: 'Success', message: 'No unsynced checked results for this test.' },
        summary: {
          uploadedResults: 0,
          uploadedItems: 0,
          duplicateResults: 0,
          duplicateItems: 0,
        },
      };
    }

    const localResultIds = localTestResults.map((row) => row.local_result_id);
    const localItemResponses = getUnsyncedItemResponsesForLocalResults(localResultIds);
    const payload = mapUploadPayload(teacherId, testId, localTestResults, localItemResponses);

    if (payload.testResults.length === 0) {
      return {
        success: true,
        noData: true,
        response: { status: 'Success', message: 'No unsynced checked results for this test.' },
        summary: {
          uploadedResults: 0,
          uploadedItems: 0,
          duplicateResults: 0,
          duplicateItems: 0,
        },
      };
    }

    const uploadUrl = getSyncUploadUrl();
    console.log('SYNC: Upload URL:', uploadUrl);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Sync request failed with status ${response.status}`);
    }

    const responseBody = (await response.json()) as ApiResponse<UploadSyncResponse>;
    if (!responseBody.success) {
      throw new Error(responseBody.message || 'Server rejected sync payload.');
    }

    await markAsSynced(payload);

    const summary = buildSummary(payload, responseBody.data);
    console.log('SYNC: Upload summary counts:', summary);

    return {
      success: true,
      payload,
      response: responseBody.data,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown network error during sync.',
    };
  }
};

export const syncToServer = async (
  teacherId: number,
  testId: number,
): Promise<SyncUploadResult> => {
  if (uploadInProgress) {
    return {
      success: false,
      inProgress: true,
      error: 'An upload is already in progress. Please wait for it to finish.',
    };
  }

  uploadInProgress = true;
  try {
    return await performSyncToServer(teacherId, testId);
  } finally {
    uploadInProgress = false;
  }
};

export const syncAllUnsyncedToServer = async (
  teacherId: number,
): Promise<{
  success: boolean;
  summary?: UploadSyncSummary;
  noData?: boolean;
  inProgress?: boolean;
  error?: string;
}> => {
  if (uploadInProgress) {
    return {
      success: false,
      inProgress: true,
      error: 'An upload is already in progress. Please wait for it to finish.',
    };
  }

  uploadInProgress = true;
  try {
    if (teacherId == null) {
      throw new Error('teacherId is required for sync upload.');
    }

    const unsyncedResults = getAllUnsyncedTestResults(teacherId);
    const uniqueTestIds = Array.from(new Set(unsyncedResults.map((row) => row.test_id)));

    if (uniqueTestIds.length === 0) {
      return {
        success: true,
        noData: true,
        summary: {
          uploadedResults: 0,
          uploadedItems: 0,
          duplicateResults: 0,
          duplicateItems: 0,
        },
      };
    }

    const combinedSummary: UploadSyncSummary = {
      uploadedResults: 0,
      uploadedItems: 0,
      duplicateResults: 0,
      duplicateItems: 0,
    };

    for (const currentTestId of uniqueTestIds) {
      const result = await performSyncToServer(teacherId, currentTestId);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      if (!result.summary) {
        continue;
      }

      combinedSummary.uploadedResults += result.summary.uploadedResults;
      combinedSummary.uploadedItems += result.summary.uploadedItems;
      combinedSummary.duplicateResults += result.summary.duplicateResults;
      combinedSummary.duplicateItems += result.summary.duplicateItems;
    }

    return { success: true, summary: combinedSummary };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown network error during debug sync.',
    };
  } finally {
    uploadInProgress = false;
  }
};
