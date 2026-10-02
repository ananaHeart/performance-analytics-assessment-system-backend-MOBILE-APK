import type { Transaction } from 'react-native-quick-sqlite';

import type {
  V3AnswerSheetManifest,
  V3ManifestPage,
  V3ManifestRegion,
} from './contracts';
import { V3_CONTRACT_VERSION } from './contracts';
import { getV3Database, v3NowIso, v3RowsToArray, withV3Transaction } from './database';
import { firstV3Row, insertV3Row, upsertV3Row } from './sqlite';

interface AnswerSheetRow {
  answer_sheet_version_id: number;
  manifest_hash: string;
  assignment_uuid: string;
  test_assignment_id: number;
  paper_size_id: number;
  test_version_number: number;
  total_questions: number;
  total_pages: number;
}

interface PaperSizeRow {
  paper_size_id: number;
  width_points: number;
  height_points: number;
}

interface TemplateRow {
  omr_template_id: number;
  template_version: string;
  geometry_hash: string;
  paper_size_code: string;
  orientation: string;
}

interface CountRow {
  count: number;
}

interface IdRow {
  id: number;
}

interface QuestionIdentityRow {
  question_uuid: string;
  test_part_id: number;
  global_item_number: number;
  question_type_code: string;
}

export interface V3ManifestSaveResult {
  answerSheetUuid: string;
  manifestHash: string;
  status: 'committed' | 'replayed';
  pageCount: number;
  regionCount: number;
  optionCount: number;
}

const almostEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= 0.01;

const assertRectangle = (
  page: V3ManifestPage,
  region: V3ManifestRegion,
): void => {
  const { x, y, width, height } = region.rectangle;
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > page.coordinateSpace.width + 0.01 ||
    y + height > page.coordinateSpace.height + 0.01
  ) {
    throw new Error(
      `Region ${region.regionUuid} falls outside page ${page.pageNumber}.`,
    );
  }
};

const validateManifest = (manifest: V3AnswerSheetManifest): void => {
  if (manifest.contractVersion !== V3_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported V3 contract version ${manifest.contractVersion}.`,
    );
  }
  if (manifest.pages.length !== manifest.totalPages) {
    throw new Error('Manifest page count does not match totalPages.');
  }

  const pageNumbers = new Set<number>();
  const pageUuids = new Set<string>();
  const regionUuids = new Set<string>();
  const questionIds = new Set<number>();

  manifest.pages.forEach(page => {
    if (pageNumbers.has(page.pageNumber) || pageUuids.has(page.pageUuid)) {
      throw new Error(`Duplicate manifest page ${page.pageNumber}.`);
    }
    if (page.totalPages !== manifest.totalPages) {
      throw new Error(
        `Page ${page.pageNumber} has an inconsistent totalPages.`,
      );
    }
    if (
      page.pageNumber < 1 ||
      page.pageNumber > manifest.totalPages ||
      page.coordinateSpace.unit !== 'pt' ||
      !almostEqual(page.coordinateSpace.width, manifest.paperSize.widthPt) ||
      !almostEqual(page.coordinateSpace.height, manifest.paperSize.heightPt)
    ) {
      throw new Error(
        `Page ${page.pageNumber} has an invalid coordinate space.`,
      );
    }

    pageNumbers.add(page.pageNumber);
    pageUuids.add(page.pageUuid);
    page.regions.forEach(region => {
      if (regionUuids.has(region.regionUuid)) {
        throw new Error(`Duplicate manifest region UUID ${region.regionUuid}.`);
      }
      if (questionIds.has(region.questionId)) {
        throw new Error(
          `Question ${region.questionId} appears in more than one manifest region.`,
        );
      }

      const objective =
        region.questionType === 'multiple_choice' ||
        region.questionType === 'true_false';
      if (
        (objective && region.regionType !== 'objective_bubbles') ||
        (!objective && region.regionType !== 'written_response')
      ) {
        throw new Error(
          `Region ${region.regionUuid} has an incompatible question and region type.`,
        );
      }
      if (
        (objective && !region.options.length) ||
        (!objective && region.options.length)
      ) {
        throw new Error(
          `Region ${region.regionUuid} has an invalid option coordinate set.`,
        );
      }

      assertRectangle(page, region);
      assertUniqueOptions(region);
      regionUuids.add(region.regionUuid);
      questionIds.add(region.questionId);
    });
  });

  for (let pageNumber = 1; pageNumber <= manifest.totalPages; pageNumber += 1) {
    if (!pageNumbers.has(pageNumber)) {
      throw new Error(`Manifest is missing page ${pageNumber}.`);
    }
  }
  if (questionIds.size !== manifest.totalQuestions) {
    throw new Error('Manifest region count does not match totalQuestions.');
  }
};

const assertUniqueOptions = (region: V3ManifestRegion): void => {
  const keys = new Set<string>();
  const values = new Set<string>();
  region.options.forEach(option => {
    if (keys.has(option.key) || values.has(option.storedValue)) {
      throw new Error(
        `Region ${region.regionUuid} contains duplicate option identities.`,
      );
    }
    keys.add(option.key);
    values.add(option.storedValue);
  });
};

const requireAnswerSheet = (
  transaction: Transaction,
  manifest: V3AnswerSheetManifest,
): AnswerSheetRow => {
  const answerSheet = firstV3Row<AnswerSheetRow>(
    transaction.execute(
      `SELECT answer_sheet_version_id, manifest_hash, assignment_uuid,
              test_assignment_id, paper_size_id, test_version_number,
              total_questions, total_pages
         FROM answer_sheet_versions
        WHERE answer_sheet_uuid = ?`,
      [manifest.answerSheetUuid],
    ),
  );
  if (!answerSheet) {
    throw new Error(
      'Answer sheet identity is unavailable. Save the V3 download before its manifest.',
    );
  }
  if (
    answerSheet.manifest_hash !== manifest.manifestHash ||
    answerSheet.assignment_uuid !== manifest.testAssignment.assignmentUuid ||
    Number(answerSheet.test_assignment_id) !==
      manifest.testAssignment.testAssignmentId ||
    Number(answerSheet.test_version_number) !== manifest.testVersionNumber ||
    Number(answerSheet.total_questions) !== manifest.totalQuestions ||
    Number(answerSheet.total_pages) !== manifest.totalPages
  ) {
    throw new Error(
      `Manifest identity does not match answer sheet ${manifest.answerSheetUuid}.`,
    );
  }
  return answerSheet;
};

const requirePaperSize = (
  transaction: Transaction,
  manifest: V3AnswerSheetManifest,
  answerSheet: AnswerSheetRow,
): void => {
  const paperSize = firstV3Row<PaperSizeRow>(
    transaction.execute(
      `SELECT paper_size_id, width_points, height_points
         FROM paper_sizes
        WHERE paper_size_code = ?`,
      [manifest.paperSize.code],
    ),
  );
  if (
    !paperSize ||
    Number(paperSize.paper_size_id) !== Number(answerSheet.paper_size_id) ||
    !almostEqual(Number(paperSize.width_points), manifest.paperSize.widthPt) ||
    !almostEqual(Number(paperSize.height_points), manifest.paperSize.heightPt)
  ) {
    throw new Error('Manifest paper size does not match saved reference data.');
  }
};

const requireTemplate = (
  transaction: Transaction,
  page: V3ManifestPage,
  manifest: V3AnswerSheetManifest,
): number => {
  const template = firstV3Row<TemplateRow>(
    transaction.execute(
      `SELECT omr_template_id, template_version, geometry_hash,
              paper_size_code, orientation
         FROM omr_templates
        WHERE template_code = ?`,
      [page.template.code],
    ),
  );
  if (
    !template ||
    template.template_version !== page.template.version ||
    template.geometry_hash !== page.template.geometryHash ||
    template.paper_size_code !== manifest.paperSize.code ||
    template.orientation !== manifest.paperSize.orientation
  ) {
    throw new Error(
      `Page ${page.pageNumber} does not match OMR template ${page.template.code}.`,
    );
  }
  return Number(template.omr_template_id);
};

const requireRegionQuestion = (
  transaction: Transaction,
  region: V3ManifestRegion,
): void => {
  const question = firstV3Row<QuestionIdentityRow>(
    transaction.execute(
      `SELECT q.question_uuid, q.test_part_id, q.global_item_number,
              qt.question_type_code
         FROM questions q
         JOIN question_types qt
           ON qt.question_type_id = q.question_type_id
        WHERE q.question_id = ?`,
      [region.questionId],
    ),
  );
  if (
    !question ||
    question.question_uuid !== region.questionUuid ||
    Number(question.test_part_id) !== region.testPartId ||
    Number(question.global_item_number) !== region.globalItemNumber ||
    question.question_type_code !== region.questionType
  ) {
    throw new Error(
      `Region ${region.regionUuid} does not match its downloaded question identity.`,
    );
  }
};

export const saveV3AnswerSheetManifest = async (
  manifest: V3AnswerSheetManifest,
): Promise<V3ManifestSaveResult> => {
  validateManifest(manifest);
  const regionCount = manifest.pages.reduce(
    (total, page) => total + page.regions.length,
    0,
  );
  const optionCount = manifest.pages.reduce(
    (pageTotal, page) =>
      pageTotal +
      page.regions.reduce(
        (regionTotal, region) => regionTotal + region.options.length,
        0,
      ),
    0,
  );
  let replayed = false;

  await withV3Transaction(transaction => {
    const answerSheet = requireAnswerSheet(transaction, manifest);
    requirePaperSize(transaction, manifest, answerSheet);
    // Written before the replay check below, so installs whose pages were
    // saved before this cache existed still get it on their next download.
    upsertV3Row(
      transaction,
      'answer_sheet_manifest_cache',
      {
        answer_sheet_uuid: manifest.answerSheetUuid,
        manifest_json: JSON.stringify(manifest),
        cached_at: v3NowIso(),
      },
      ['answer_sheet_uuid'],
    );

    const existingPages = Number(
      firstV3Row<CountRow>(
        transaction.execute(
          `SELECT COUNT(*) AS count
             FROM answer_sheet_pages
            WHERE answer_sheet_version_id = ?`,
          [answerSheet.answer_sheet_version_id],
        ),
      )?.count ?? 0,
    );
    if (existingPages > 0) {
      const existingRegions = Number(
        firstV3Row<CountRow>(
          transaction.execute(
            `SELECT COUNT(*) AS count
               FROM answer_sheet_regions
              WHERE answer_sheet_version_id = ?`,
            [answerSheet.answer_sheet_version_id],
          ),
        )?.count ?? 0,
      );
      const existingOptions = Number(
        firstV3Row<CountRow>(
          transaction.execute(
            `SELECT COUNT(*) AS count
               FROM answer_sheet_region_options option_row
               JOIN answer_sheet_regions region_row
                 ON region_row.answer_sheet_region_id = option_row.answer_sheet_region_id
              WHERE region_row.answer_sheet_version_id = ?`,
            [answerSheet.answer_sheet_version_id],
          ),
        )?.count ?? 0,
      );
      if (
        existingPages !== manifest.totalPages ||
        existingRegions !== regionCount ||
        existingOptions !== optionCount
      ) {
        throw new Error(
          `Saved manifest ${manifest.answerSheetUuid} is incomplete or inconsistent.`,
        );
      }
      replayed = true;
      return;
    }

    manifest.pages.forEach(page => {
      const templateId = requireTemplate(transaction, page, manifest);
      insertV3Row(transaction, 'answer_sheet_pages', {
        page_uuid: page.pageUuid,
        answer_sheet_version_id: answerSheet.answer_sheet_version_id,
        omr_template_id: templateId,
        page_number: page.pageNumber,
        total_pages: page.totalPages,
        template_version: page.template.version,
        page_geometry_hash: page.template.geometryHash,
        qr_payload_version: page.qr.payloadVersion,
        qr_payload: page.qr.payload,
        qr_payload_hash: page.qr.payloadHash,
        qr_error_correction: page.qr.errorCorrection,
        coordinate_unit: page.coordinateSpace.unit,
        coordinate_origin: page.coordinateSpace.origin,
        coordinate_width: page.coordinateSpace.width,
        coordinate_height: page.coordinateSpace.height,
        page_status: 'ready',
      });

      const pageRow = firstV3Row<IdRow>(
        transaction.execute(
          `SELECT answer_sheet_page_id AS id
             FROM answer_sheet_pages
            WHERE page_uuid = ?`,
          [page.pageUuid],
        ),
      );
      if (!pageRow) {
        throw new Error(`Unable to resolve manifest page ${page.pageUuid}.`);
      }

      page.regions.forEach(region => {
        requireRegionQuestion(transaction, region);
        insertV3Row(transaction, 'answer_sheet_regions', {
          region_uuid: region.regionUuid,
          answer_sheet_version_id: answerSheet.answer_sheet_version_id,
          answer_sheet_page_id: pageRow.id,
          template_region_code: region.templateRegionCode,
          question_id: region.questionId,
          question_uuid: region.questionUuid,
          test_part_id: region.testPartId,
          global_item_number: region.globalItemNumber,
          part_item_number: region.partItemNumber,
          region_sequence: 1,
          question_type_code: region.questionType,
          region_type: region.regionType,
          response_region_size: region.responseRegionSize,
          expected_response_count_snapshot: region.expectedResponseCount,
          response_line_count: region.responseLineCount,
          x_points: region.rectangle.x,
          y_points: region.rectangle.y,
          width_points: region.rectangle.width,
          height_points: region.rectangle.height,
          geometry_json: JSON.stringify({ rectangle: region.rectangle }),
          geometry_hash: region.geometryHash,
        });

        const regionRow = firstV3Row<IdRow>(
          transaction.execute(
            `SELECT answer_sheet_region_id AS id
               FROM answer_sheet_regions
              WHERE region_uuid = ?`,
            [region.regionUuid],
          ),
        );
        if (!regionRow) {
          throw new Error(
            `Unable to resolve manifest region ${region.regionUuid}.`,
          );
        }
        region.options.forEach(option =>
          insertV3Row(transaction, 'answer_sheet_region_options', {
            answer_sheet_region_id: regionRow.id,
            option_key: option.key,
            stored_value: option.storedValue,
            center_x: option.centerX,
            center_y: option.centerY,
          }),
        );
      });
    });
  });

  return {
    answerSheetUuid: manifest.answerSheetUuid,
    manifestHash: manifest.manifestHash,
    status: replayed ? 'replayed' : 'committed',
    pageCount: manifest.pages.length,
    regionCount,
    optionCount,
  };
};

/** The manifest saved at download time, or null if it was never downloaded. */
// Reused only while it still matches the downloaded answer sheet's manifest
// hash; anything else (missing, or an answer sheet that no longer lists that
// hash) returns null so the caller fetches it again.
export const getV3CachedAnswerSheetManifest = (
  answerSheetUuid: string,
): V3AnswerSheetManifest | null => {
  const row = v3RowsToArray<{ manifest_json: string; manifest_hash: string | null }>(
    getV3Database().execute(
      `SELECT cache.manifest_json, sheet.manifest_hash
         FROM answer_sheet_manifest_cache cache
         LEFT JOIN answer_sheet_versions sheet
           ON sheet.answer_sheet_uuid = cache.answer_sheet_uuid
        WHERE cache.answer_sheet_uuid = ?`,
      [answerSheetUuid],
    ),
  )[0];
  if (!row) return null;
  const manifest = JSON.parse(row.manifest_json) as V3AnswerSheetManifest;
  return manifest.manifestHash === row.manifest_hash ? manifest : null;
};
