import type { Transaction } from 'react-native-quick-sqlite';

import type {
  V3MobileReferenceData,
  V3OmrTemplateCapability,
  V3TemplateRegion,
} from './contracts';
import { V3_CONTRACT_VERSION, V3_SNAPSHOT_MODE } from './contracts';
import { v3NowIso, withV3Transaction } from './database';
import { sha256Hex } from './integrity';
import { firstV3Row, upsertV3Row, v3Boolean } from './sqlite';

interface ExistingTemplateIdentityRow {
  omr_template_id: number;
  template_code: string;
  template_version: string;
  question_type_code: string | null;
  paper_size_code: string;
  orientation: string;
  qr_payload_version: number;
  geometry_hash: string;
}

interface ExistingTemplateRegionIdentityRow {
  region_uuid: string;
  omr_template_id: number;
  region_code: string;
  geometry_hash: string;
}

export interface V3ReferenceDataSaveResult {
  payloadHash: string;
  questionTypeCount: number;
  paperSizeCount: number;
  templateCount: number;
  regionCount: number;
}

const assertReferenceRelationships = (payload: V3MobileReferenceData): void => {
  if (payload.contractVersion !== V3_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported V3 contract version ${payload.contractVersion}.`,
    );
  }
  if (payload.downloadMode !== V3_SNAPSHOT_MODE) {
    throw new Error(`Unsupported V3 download mode ${payload.downloadMode}.`);
  }

  const questionTypes = new Set(payload.questionTypes.map(item => item.code));
  const paperSizes = new Set(payload.paperSizes.map(item => item.code));
  const templateIds = new Set<number>();
  const templateCodes = new Set<string>();
  const regionUuids = new Set<string>();

  payload.omrTemplates.forEach(template => {
    if (templateIds.has(template.omrTemplateId)) {
      throw new Error(`Duplicate OMR template id ${template.omrTemplateId}.`);
    }
    if (templateCodes.has(template.code)) {
      throw new Error(`Duplicate OMR template code ${template.code}.`);
    }
    if (template.questionType && !questionTypes.has(template.questionType)) {
      throw new Error(
        `OMR template ${template.code} references an unknown question type.`,
      );
    }
    if (!paperSizes.has(template.paperSize)) {
      throw new Error(
        `OMR template ${template.code} references an unknown paper size.`,
      );
    }

    templateIds.add(template.omrTemplateId);
    templateCodes.add(template.code);
    template.regions.forEach(region => {
      if (regionUuids.has(region.regionUuid)) {
        throw new Error(`Duplicate template region UUID ${region.regionUuid}.`);
      }
      if (region.questionType && !questionTypes.has(region.questionType)) {
        throw new Error(
          `Template region ${region.regionUuid} references an unknown question type.`,
        );
      }
      regionUuids.add(region.regionUuid);
    });
  });
};

const assertStoredTemplateIdentity = (
  transaction: Transaction,
  template: V3OmrTemplateCapability,
): void => {
  const existing = firstV3Row<ExistingTemplateIdentityRow>(
    transaction.execute(
      `SELECT omr_template_id, template_code, template_version,
              question_type_code, paper_size_code, orientation,
              qr_payload_version, geometry_hash
         FROM omr_templates
        WHERE omr_template_id = ? OR template_code = ?`,
      [template.omrTemplateId, template.code],
    ),
  );
  if (
    existing &&
    (Number(existing.omr_template_id) !== template.omrTemplateId ||
      existing.template_code !== template.code ||
      existing.template_version !== template.version ||
      existing.question_type_code !== template.questionType ||
      existing.paper_size_code !== template.paperSize ||
      existing.orientation !== template.orientation ||
      Number(existing.qr_payload_version) !== template.qrPayloadVersion ||
      existing.geometry_hash !== template.geometryHash)
  ) {
    throw new Error(
      `OMR template identity ${template.code} is immutable and cannot be replaced.`,
    );
  }
};

const assertStoredTemplateRegionIdentity = (
  transaction: Transaction,
  templateId: number,
  region: V3TemplateRegion,
): void => {
  const existing = firstV3Row<ExistingTemplateRegionIdentityRow>(
    transaction.execute(
      `SELECT region_uuid, omr_template_id, region_code, geometry_hash
         FROM omr_template_regions
        WHERE region_uuid = ?
           OR (omr_template_id = ? AND region_code = ?)`,
      [region.regionUuid, templateId, region.regionCode],
    ),
  );
  if (
    existing &&
    (existing.region_uuid !== region.regionUuid ||
      Number(existing.omr_template_id) !== templateId ||
      existing.region_code !== region.regionCode ||
      existing.geometry_hash !== region.geometryHash)
  ) {
    throw new Error(
      `Template region identity ${region.regionUuid} is immutable and cannot be replaced.`,
    );
  }
};

export const saveV3ReferenceData = async (
  payload: V3MobileReferenceData,
): Promise<V3ReferenceDataSaveResult> => {
  assertReferenceRelationships(payload);
  const payloadHash = sha256Hex(payload);
  const refreshedAt = v3NowIso();

  await withV3Transaction(transaction => {
    payload.questionTypes.forEach(item => {
      upsertV3Row(
        transaction,
        'question_types',
        {
          question_type_id: item.questionTypeId,
          question_type_code: item.code,
          question_type_name: item.name,
          capture_mode: item.captureMode,
          scoring_mode: item.scoringMode,
          supports_omr: v3Boolean(item.supportsOmr),
          supports_ocr: v3Boolean(item.supportsOcr),
          supports_multiple_response: v3Boolean(item.supportsMultipleResponse),
          requires_attachment: v3Boolean(item.requiresAttachment),
          requires_teacher_verification: v3Boolean(
            item.requiresTeacherVerification,
          ),
          allows_teacher_answer_edit: v3Boolean(item.allowsTeacherAnswerEdit),
        },
        ['question_type_id'],
      );
    });

    payload.paperSizes.forEach(item => {
      upsertV3Row(
        transaction,
        'paper_sizes',
        {
          paper_size_id: item.paperSizeId,
          paper_size_code: item.code,
          paper_size_name: item.name,
          width_points: item.widthPt,
          height_points: item.heightPt,
          operationally_supported: v3Boolean(item.operationallySupported),
        },
        ['paper_size_id'],
      );
    });

    payload.omrTemplates.forEach(template => {
      assertStoredTemplateIdentity(transaction, template);
      upsertV3Row(
        transaction,
        'omr_templates',
        {
          omr_template_id: template.omrTemplateId,
          template_code: template.code,
          template_name: template.name,
          template_version: template.version,
          question_type_code: template.questionType,
          paper_size_code: template.paperSize,
          orientation: template.orientation,
          minimum_item_count: template.minimumItemCount,
          maximum_item_count: template.maximumItemCount,
          option_count: template.optionCount,
          qr_payload_version: template.qrPayloadVersion,
          minimum_scanner_version: template.minimumScannerVersion,
          coordinate_origin: template.coordinateOrigin,
          required_print_scale_percent: template.requiredPrintScalePercent,
          geometry_hash: template.geometryHash,
          physically_validated: v3Boolean(template.physicallyValidated),
        },
        ['omr_template_id'],
      );

      template.regions.forEach(region => {
        assertStoredTemplateRegionIdentity(
          transaction,
          template.omrTemplateId,
          region,
        );
        upsertV3Row(
          transaction,
          'omr_template_regions',
          {
            region_uuid: region.regionUuid,
            omr_template_id: template.omrTemplateId,
            region_code: region.regionCode,
            region_order: region.regionOrder,
            region_type: region.regionType,
            question_type_code: region.questionType,
            layout_variant: region.layoutVariant,
            response_region_size: region.responseRegionSize,
            x_points: region.rectangle.x,
            y_points: region.rectangle.y,
            width_points: region.rectangle.width,
            height_points: region.rectangle.height,
            geometry_json: JSON.stringify(region.geometry),
            geometry_hash: region.geometryHash,
            is_required: v3Boolean(region.required),
          },
          ['region_uuid'],
        );
      });
    });

    upsertV3Row(
      transaction,
      'reference_data_state',
      {
        reference_data_state_id: 1,
        contract_version: payload.contractVersion,
        server_time: payload.serverTime,
        download_mode: payload.downloadMode,
        payload_hash: payloadHash,
        statuses_json: JSON.stringify(payload.statuses),
        sync_policy_json: JSON.stringify(payload.syncPolicy),
        refreshed_at: refreshedAt,
      },
      ['reference_data_state_id'],
    );
  });

  return {
    payloadHash,
    questionTypeCount: payload.questionTypes.length,
    paperSizeCount: payload.paperSizes.length,
    templateCount: payload.omrTemplates.length,
    regionCount: payload.omrTemplates.reduce(
      (total, template) => total + template.regions.length,
      0,
    ),
  };
};
