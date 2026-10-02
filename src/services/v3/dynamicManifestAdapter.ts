import type {V3AnswerSheetManifest} from '../../database/v3/contracts';

/**
 * Converts the general V3 answer-sheet manifest contract (as fetched via
 * mobileReadClient.getAnswerSheetManifest, matching the backend's
 * V3AnswerSheetManifestResponse) into the JSON shape DynamicOmrDetector.kt's
 * parseManifest() expects as the `manifestJson` scan option.
 *
 * page.registrationMarkers is a dedicated field on the fetched contract (added by
 * backend specifically to match the native detector's expectations one-for-one:
 * {markerId, corner, style, rectangle}) - distinct from `templateRegions`, which
 * only carries shared/fixed catalog rows unrelated to marker geometry. The native
 * scanner additionally requires the 4 markers in a fixed order
 * [top_left, top_right, bottom_right, bottom_left], which this reorders explicitly
 * rather than trusting the fetched array's order. Everything else (question
 * regions, qr payload, coordinateSpace, template identity) already matches the
 * native shape closely enough to pass through directly.
 */

export class V3DynamicManifestAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V3DynamicManifestAdapterError';
  }
}

const CANONICAL_CORNER_ORDER = [
  'top_left',
  'top_right',
  'bottom_right',
  'bottom_left',
] as const;

const fail = (message: string): never => {
  throw new V3DynamicManifestAdapterError(message);
};

const buildNativePage = (page: V3AnswerSheetManifest['pages'][number]) => {
  const markersByCorner = new Map(page.registrationMarkers.map(marker => [marker.corner, marker]));
  const registrationMarkers = CANONICAL_CORNER_ORDER.map(corner => {
    const marker = markersByCorner.get(corner);
    if (!marker) {
      fail(`Page ${page.pageNumber} is missing the ${corner} registration marker.`);
    }
    return {corner: marker!.corner, style: marker!.style, rectangle: marker!.rectangle};
  });

  if (!page.pageGeometryHash) {
    fail(`Page ${page.pageNumber} has no pageGeometryHash - cannot validate against the printed QR.`);
  }

  return {
    pageUuid: page.pageUuid,
    pageNumber: page.pageNumber,
    totalPages: page.totalPages,
    // template.geometryHash is deliberately overridden with pageGeometryHash: the
    // fetched contract's `template.geometryHash` is the shared/generic template-
    // level hash (constant across every sheet using this template), but the
    // native scanner's single `template.geometryHash` slot is what the printed
    // QR's "gh" field actually encodes - which is this answer sheet's own
    // content-derived pageGeometryHash, not the shared one.
    template: {...page.template, geometryHash: page.pageGeometryHash},
    qr: {payload: page.qr.payload},
    coordinateSpace: page.coordinateSpace,
    registrationMarkers,
    regions: page.regions.map(region => ({
      regionUuid: region.regionUuid,
      questionId: region.questionId,
      questionUuid: region.questionUuid,
      globalItemNumber: region.globalItemNumber,
      questionType: region.questionType,
      regionType: region.regionType,
      rectangle: region.rectangle,
      options: region.options,
    })),
  };
};

export const buildDynamicScannerManifestJson = (
  manifest: V3AnswerSheetManifest,
): string => {
  if (manifest.designSystem === null) {
    fail('This answer sheet has no designSystem - it is not a dynamic-template manifest.');
  }

  return JSON.stringify({
    contractVersion: manifest.contractVersion,
    manifestVersion: manifest.manifestVersion,
    designSystem: manifest.designSystem,
    requiredScannerVersion: manifest.requiredScannerVersion,
    paperSize: manifest.paperSize,
    manifestHash: manifest.manifestHash,
    answerSheetUuid: manifest.answerSheetUuid,
    testAssignment: manifest.testAssignment,
    totalPages: manifest.totalPages,
    pages: manifest.pages.map(buildNativePage),
  });
};
