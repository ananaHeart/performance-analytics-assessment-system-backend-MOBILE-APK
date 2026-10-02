import {Platform} from 'react-native';

import {API_BASE_URL} from '../config/api';
import {
  getV2LocalCounts,
  saveV2DownloadPayload,
  type V2LocalCounts,
} from '../database/v2/downloadRepository';
import type {V2DownloadPayload, V2UploadResponse} from '../database/v2/contracts';
import {
  applyV2UploadResponse,
  markV2UploadFailed,
  normalizeBatchStatus,
  prepareV2Upload,
} from '../database/v2/syncRepository';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface V2DownloadResult {
  generatedAt: string;
  counts: V2LocalCounts;
}

export interface V2UploadResult {
  success: boolean;
  noData: boolean;
  uploadedResults: number;
  failedResults: number;
  completedAt: string | null;
  error?: string;
}

const getDeviceIdentifier = (): string => {
  const constants = Platform.constants as Record<string, unknown>;
  const parts = ['Brand', 'Manufacturer', 'Model', 'Product', 'Fingerprint']
    .map(key => String(constants[key] ?? '').trim())
    .filter(Boolean);
  return (parts.join('|') || `${Platform.OS}-device`).slice(0, 255);
};

export const downloadV2SyncData = async (accessToken: string): Promise<V2DownloadResult> => {
  if (!accessToken.trim()) {
    throw new Error('V2 access token is unavailable. Log in again before downloading V2 data.');
  }

  const response = await fetch(`${API_BASE_URL}/api/v2/sync/download`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const responseBody = (await response.json().catch(() => ({}))) as ApiResponse<V2DownloadPayload>;

  if (!response.ok || !responseBody.success || !responseBody.data) {
    throw new Error(responseBody.message || `V2 download failed with status ${response.status}`);
  }

  await saveV2DownloadPayload(responseBody.data);
  return {
    generatedAt: responseBody.data.generatedAt,
    counts: getV2LocalCounts(),
  };
};

export const uploadV2UnsyncedResults = async (
  accessToken: string,
  testId: number,
): Promise<V2UploadResult> => {
  if (!accessToken.trim()) {
    return {
      success: false,
      noData: false,
      uploadedResults: 0,
      failedResults: 0,
      completedAt: null,
      error: 'Access token is unavailable. Log in again before uploading.',
    };
  }

  const prepared = await prepareV2Upload(testId, getDeviceIdentifier());
  if (!prepared) {
    return {
      success: true,
      noData: true,
      uploadedResults: 0,
      failedResults: 0,
      completedAt: null,
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/sync/upload`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(prepared.payload),
    });
    const responseBody = (await response.json().catch(() => ({}))) as ApiResponse<V2UploadResponse>;
    if (!response.ok || !responseBody.success || !responseBody.data) {
      throw new Error(responseBody.message || `Upload failed with status ${response.status}`);
    }

    const uploadResponse: V2UploadResponse = {
      ...responseBody.data,
      status: normalizeBatchStatus(responseBody.data.status),
    };
    await applyV2UploadResponse(prepared, uploadResponse);
    const uploadedResults = uploadResponse.items.filter(item => item.status === 'success').length;
    const failedResults = uploadResponse.items.length - uploadedResults;
    return {
      success: failedResults === 0,
      noData: false,
      uploadedResults,
      failedResults,
      completedAt: uploadResponse.completedAt,
      error: failedResults > 0 ? `${failedResults} result(s) could not be uploaded.` : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload verified results.';
    await markV2UploadFailed(prepared, message);
    return {
      success: false,
      noData: false,
      uploadedResults: 0,
      failedResults: prepared.payload.results.length,
      completedAt: null,
      error: message,
    };
  }
};
