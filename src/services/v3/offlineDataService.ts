import { initV3Database } from '../../database/v3/database';
import {
  saveV3MobileDownload,
  type V3DownloadSaveResult,
} from '../../database/v3/downloadRepository';
import {
  saveV3AnswerSheetManifest,
  type V3ManifestSaveResult,
} from '../../database/v3/manifestRepository';
import {
  saveV3ReferenceData,
  type V3ReferenceDataSaveResult,
} from '../../database/v3/referenceDataRepository';
import type {
  V3MobileReadClient,
  V3MobileRequestOptions,
} from './mobileReadClient';

export interface V3OfflineDataService {
  refreshOfflineBaseline(
    options?: V3MobileRequestOptions,
  ): Promise<V3OfflineBaselineResult>;
  refreshReferenceData(
    options?: V3MobileRequestOptions,
  ): Promise<V3ReferenceDataSaveResult>;
  refreshDownload(
    options?: V3MobileRequestOptions,
  ): Promise<V3DownloadSaveResult>;
  downloadAnswerSheetManifest(
    assignmentUuid: string,
    answerSheetUuid: string,
    options?: V3MobileRequestOptions,
  ): Promise<V3ManifestSaveResult>;
}

export interface V3OfflineBaselineResult {
  referenceData: V3ReferenceDataSaveResult;
  download: V3DownloadSaveResult;
  manifests: V3ManifestSaveResult[];
}

export const createV3OfflineDataService = (
  client: V3MobileReadClient,
): V3OfflineDataService => ({
  refreshOfflineBaseline: async options => {
    const referenceEnvelope = await client.getReferenceData(options);
    const downloadEnvelope = await client.getDownload(options);
    await initV3Database();
    const referenceData = await saveV3ReferenceData(referenceEnvelope.data);
    const download = await saveV3MobileDownload(downloadEnvelope.data);
    const manifests: V3ManifestSaveResult[] = [];
    for (const answerSheet of downloadEnvelope.data.answerSheets) {
      const manifestEnvelope = await client.getAnswerSheetManifest(
        answerSheet.assignmentUuid,
        answerSheet.answerSheetUuid,
        options,
      );
      manifests.push(await saveV3AnswerSheetManifest(manifestEnvelope.data));
    }
    return { referenceData, download, manifests };
  },
  refreshReferenceData: async options => {
    const envelope = await client.getReferenceData(options);
    await initV3Database();
    return saveV3ReferenceData(envelope.data);
  },
  refreshDownload: async options => {
    const envelope = await client.getDownload(options);
    await initV3Database();
    return saveV3MobileDownload(envelope.data);
  },
  downloadAnswerSheetManifest: async (
    assignmentUuid,
    answerSheetUuid,
    options,
  ) => {
    const envelope = await client.getAnswerSheetManifest(
      assignmentUuid,
      answerSheetUuid,
      options,
    );
    await initV3Database();
    return saveV3AnswerSheetManifest(envelope.data);
  },
});
