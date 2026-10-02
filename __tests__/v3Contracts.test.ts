import {
  parseV3AnswerSheetManifestEnvelope,
  parseV3MobileDownloadEnvelope,
  parseV3MobileReferenceDataEnvelope,
} from '../src/database/v3/parsers';

const referenceDataFixture =
  require('./fixtures/v3/mobile/reference-data-response.json') as unknown;
const downloadFixture =
  require('./fixtures/v3/mobile/download-response.json') as unknown;
const manifestFixture =
  require('./fixtures/v3/mobile/answer-sheet-manifest-response.json') as unknown;

const cloneFixture = <T>(fixture: T): T =>
  JSON.parse(JSON.stringify(fixture)) as T;

describe('isolated V3 Mobile read contract', () => {
  test('parses the authoritative reference-data fixture', () => {
    const envelope = parseV3MobileReferenceDataEnvelope(referenceDataFixture);

    expect(envelope.data.contractVersion).toBe('3.0');
    expect(envelope.data.questionTypes.map(type => type.code)).toEqual([
      'multiple_choice',
      'true_false',
      'identification',
      'enumeration',
      'essay',
    ]);
    expect(envelope.data.syncPolicy).toMatchObject({
      syncAction: 'upsert',
      oneAssignmentPerSync: true,
      scanPageUploadAvailable: false,
      minimumAnswerSheetQuestions: 5,
    });
  });

  test('accepts a null questionType on a mixed-question-type OMR template', () => {
    // A dynamic template (OMR-*-DYNAMIC-CTX-V3) spans multiple_choice, true_false,
    // identification, etc. rather than one single type, so unlike the fixed
    // single-type MC template it has no one questionType value to report.
    const fixture = cloneFixture(referenceDataFixture) as {
      data: {omrTemplates: Array<Record<string, unknown>>};
    };
    fixture.data.omrTemplates.push({
      ...fixture.data.omrTemplates[0],
      omrTemplateId: 2,
      code: 'OMR-A4-DYNAMIC-CTX-V3',
      name: 'Dynamic mixed-question-type A4',
      version: '3',
      questionType: null,
      minimumItemCount: 5,
      maximumItemCount: null,
      optionCount: null,
      physicallyValidated: false,
    });

    const envelope = parseV3MobileReferenceDataEnvelope(fixture);

    expect(envelope.data.omrTemplates[1]).toMatchObject({
      code: 'OMR-A4-DYNAMIC-CTX-V3',
      questionType: null,
    });
  });

  test('parses the authoritative full-snapshot fixture without sensitive data', () => {
    const envelope = parseV3MobileDownloadEnvelope(downloadFixture);

    expect(envelope.data.snapshotMode).toBe('full_snapshot');
    expect(envelope.data.testAssignments[0]).toMatchObject({
      assignmentStatus: 'open',
      captureAllowedNow: true,
      captureAvailability: 'open',
    });
    expect(envelope.data.classAssignments[0].classStatus).toBe('active');
    expect(envelope.data.classAssignmentSchedules[0]).toMatchObject({
      classAssignmentScheduleId: 70001,
      dayOfWeek: 1,
      timezoneName: 'Asia/Manila',
      scheduleStatus: 'active',
    });
    expect(envelope.data.questionOptions).toHaveLength(4);
    expect(envelope.data.partSkillMappings[0].itemCount).toBe(10);
    expect(envelope.data).not.toHaveProperty('answerKeys');
  });

  test('parses the authoritative immutable answer-sheet manifest fixture', () => {
    const envelope = parseV3AnswerSheetManifestEnvelope(manifestFixture);
    const firstRegion = envelope.data.pages[0].regions[0];

    expect(envelope.data.answerSheetUuid).toBe(
      '56d628da-d7fc-4faa-b018-3f740e048bf0',
    );
    expect(envelope.data.pages).toHaveLength(envelope.data.totalPages);
    expect(firstRegion.options.map(option => option.storedValue)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  test('rejects a fixture with the wrong contract version', () => {
    const invalid = cloneFixture(referenceDataFixture) as {
      data: { contractVersion: string };
    };
    invalid.data.contractVersion = '2.0';

    expect(() => parseV3MobileReferenceDataEnvelope(invalid)).toThrow(
      '$.data.contractVersion: expected "3.0"',
    );
  });

  test('rejects sensitive answer material in a download snapshot', () => {
    const invalid = cloneFixture(downloadFixture) as {
      data: { answerKeys?: unknown[] };
    };
    invalid.data.answerKeys = [];

    expect(() => parseV3MobileDownloadEnvelope(invalid)).toThrow(
      '$.data.answerKeys: expected to be absent',
    );
  });

  test('rejects invalid class-assignment schedule boundaries', () => {
    const invalid = cloneFixture(downloadFixture) as {
      data: {
        classAssignmentSchedules: Array<{
          dayOfWeek: number;
          effectiveFrom: string;
          effectiveTo: string | null;
        }>;
      };
    };
    invalid.data.classAssignmentSchedules[0].dayOfWeek = 8;

    expect(() => parseV3MobileDownloadEnvelope(invalid)).toThrow(
      '$.data.classAssignmentSchedules[0].dayOfWeek',
    );
  });

  test('rejects a manifest when the immutable geometry hash is malformed', () => {
    const invalid = cloneFixture(manifestFixture) as {
      data: { pages: Array<{ template: { geometryHash: string } }> };
    };
    invalid.data.pages[0].template.geometryHash = 'not-a-sha256';

    expect(() => parseV3AnswerSheetManifestEnvelope(invalid)).toThrow(
      '$.data.pages[0].template.geometryHash',
    );
  });
});
