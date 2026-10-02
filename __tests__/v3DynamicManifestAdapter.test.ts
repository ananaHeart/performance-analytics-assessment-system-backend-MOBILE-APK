import {
  V3DynamicManifestAdapterError,
  buildDynamicScannerManifestJson,
} from '../src/services/v3/dynamicManifestAdapter';
import type {V3AnswerSheetManifest} from '../src/database/v3/contracts';

const marker = (
  markerId: string,
  corner: string,
  style: string,
  rectangle = {x: 0, y: 0, width: 15, height: 15},
) => ({markerId, corner, style, rectangle});

const baseManifest = (): V3AnswerSheetManifest => ({
  contractVersion: '3.0',
  manifestVersion: 2,
  answerSheetUuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
  testAssignment: {testAssignmentId: 1006, assignmentUuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb'},
  paperSize: {code: 'A4', widthPt: 595.276, heightPt: 841.89, orientation: 'portrait'},
  testVersionNumber: 1,
  totalQuestions: 1,
  totalPages: 1,
  manifestHash: 'b'.repeat(64),
  requiredScannerVersion: '3.0.0-prototype.2',
  generatedAt: '2026-09-16T00:00:00Z',
  designSystem: {code: 'SMART-DYNAMIC-ANSWER-SHEET', version: '1', nativePaperGeometry: true},
  pages: [
    {
      pageUuid: 'be42bd22-1f8b-4409-941d-9e689bc271d7',
      pageNumber: 1,
      totalPages: 1,
      template: {code: 'OMR-A4-DYNAMIC-CTX-V3', version: '3', geometryHash: 'c'.repeat(64)},
      qr: {payloadVersion: 3, payload: '{"v":3}', payloadHash: 'd'.repeat(64), errorCorrection: 'M'},
      coordinateSpace: {unit: 'pt', origin: 'pdf_bottom_left', width: 595.276, height: 841.89},
      regions: [
        {
          regionUuid: '1dd4c493-013f-4251-9d87-ad9be9533298',
          templateRegionCode: 'OBJECTIVE_SLOT_01',
          questionId: 30001,
          questionUuid: '2dd4c493-013f-4251-9d87-ad9be9533298',
          testPartId: 21001,
          globalItemNumber: 1,
          partItemNumber: 1,
          questionType: 'multiple_choice',
          regionType: 'objective_bubbles',
          responseRegionSize: null,
          expectedResponseCount: null,
          responseLineCount: null,
          rectangle: {x: 72.6, y: 597.9, width: 84.8, height: 12.8},
          geometryHash: 'e'.repeat(64),
          options: [{key: 'A', storedValue: 'A', centerX: 79.0, centerY: 604.3}],
        },
      ],
      // Deliberately different from `template.geometryHash` (page.template.code
      // above uses 'c'.repeat(64)) - this is the per-page value the printed QR's
      // "gh" field actually encodes, and the one the adapter must actually use.
      pageGeometryHash: 'f'.repeat(64),
      templateRegions: [],
      // Deliberately out of canonical order to prove the adapter reorders rather
      // than trusting fetched order.
      registrationMarkers: [
        marker('m4', 'bottom_left', 'solid'),
        marker('m2', 'top_right', 'solid'),
        marker('m3', 'bottom_right', 'solid'),
        marker('m1', 'top_left', 'hollow'),
      ],
      markerPattern: {
        orientationCorner: 'top_left',
        orientationStyle: 'hollow',
        locatorStyle: 'solid',
      },
    },
  ],
});

describe('buildDynamicScannerManifestJson', () => {
  test('reorders registration markers into the canonical corner sequence', () => {
    const json = JSON.parse(buildDynamicScannerManifestJson(baseManifest()));

    expect(json.pages[0].registrationMarkers.map((m: {corner: string}) => m.corner)).toEqual([
      'top_left',
      'top_right',
      'bottom_right',
      'bottom_left',
    ]);
    expect(json.pages[0].registrationMarkers.map((m: {style: string}) => m.style)).toEqual([
      'hollow',
      'solid',
      'solid',
      'solid',
    ]);
    // markerId is a fetched-contract-only field, not part of the native shape.
    expect(json.pages[0].registrationMarkers[0]).not.toHaveProperty('markerId');
  });

  test('maps question regions to the native field names', () => {
    const json = JSON.parse(buildDynamicScannerManifestJson(baseManifest()));

    expect(json.pages[0].regions[0]).toMatchObject({
      regionUuid: '1dd4c493-013f-4251-9d87-ad9be9533298',
      questionId: 30001,
      globalItemNumber: 1,
      questionType: 'multiple_choice',
      regionType: 'objective_bubbles',
      rectangle: {x: 72.6, y: 597.9, width: 84.8, height: 12.8},
    });
    expect(json.pages[0].qr).toEqual({payload: '{"v":3}'});
  });

  test('uses pageGeometryHash for template.geometryHash, not the shared template hash', () => {
    const json = JSON.parse(buildDynamicScannerManifestJson(baseManifest()));

    // 'f'.repeat(64) is pageGeometryHash; 'c'.repeat(64) is the original shared
    // template.geometryHash, which must NOT leak through to the native shape.
    expect(json.pages[0].template.geometryHash).toBe('f'.repeat(64));
  });

  test('rejects a page with no pageGeometryHash', () => {
    const manifest = baseManifest();
    manifest.pages[0].pageGeometryHash = null;
    expect(() => buildDynamicScannerManifestJson(manifest)).toThrow(/pageGeometryHash/);
  });

  test('preserves root identity fields the scanner validates against', () => {
    const json = JSON.parse(buildDynamicScannerManifestJson(baseManifest()));

    expect(json).toMatchObject({
      contractVersion: '3.0',
      manifestVersion: 2,
      requiredScannerVersion: '3.0.0-prototype.2',
      designSystem: {code: 'SMART-DYNAMIC-ANSWER-SHEET', nativePaperGeometry: true},
      answerSheetUuid: '56d628da-d7fc-4faa-b018-3f740e048bf0',
      testAssignment: {assignmentUuid: '26b14ea2-4383-43f5-bb40-f60683ee46bb'},
    });
  });

  test('rejects a manifest with no designSystem (not a dynamic-template sheet)', () => {
    const manifest = {...baseManifest(), designSystem: null};
    expect(() => buildDynamicScannerManifestJson(manifest)).toThrow(
      V3DynamicManifestAdapterError,
    );
  });

  test('rejects a page missing a registration marker corner', () => {
    const manifest = baseManifest();
    manifest.pages[0].registrationMarkers = manifest.pages[0].registrationMarkers.slice(0, 3);
    expect(() => buildDynamicScannerManifestJson(manifest)).toThrow(/missing the top_left/);
  });
});
