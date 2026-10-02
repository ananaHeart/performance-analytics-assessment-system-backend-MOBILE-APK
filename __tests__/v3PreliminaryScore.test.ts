import type {V3AnswerSheetManifest} from '../src/database/v3/contracts';
import type {V3EvaluationReference} from '../src/services/v3/dynamicVerificationClient';
import {computePreliminaryScore} from '../src/services/v3/preliminaryScore';

const manifest = {
  pages: [{
    regions: [
      {regionUuid: 'r-mc', options: [
        {key: 'A', storedValue: 'A'}, {key: 'B', storedValue: 'B'},
        {key: 'C', storedValue: 'C'}, {key: 'D', storedValue: 'D'},
      ]},
      // Older sample-sheet True/False layout: key "T"/"F", value "A"/"B".
      {regionUuid: 'r-tf', options: [{key: 'T', storedValue: 'A'}, {key: 'F', storedValue: 'B'}]},
      {regionUuid: 'r-id', options: []},
      {regionUuid: 'r-essay', options: []},
    ],
  }],
} as unknown as V3AnswerSheetManifest;

const reference = (withKeys: boolean): V3EvaluationReference => ({
  contractVersion: withKeys ? '3.1' : '3.0',
  assignmentUuid: 'a',
  testVersionNumber: 1,
  evaluationReferenceHash: 'h',
  questions: [
    {questionUuid: 'q-mc', maximumPoints: 1, rubricId: null, expectedResponseCount: null,
      correctOptionKey: withKeys ? 'C' : undefined},
    {questionUuid: 'q-tf', maximumPoints: 2, rubricId: null, expectedResponseCount: null,
      correctOptionKey: withKeys ? 'B' : undefined},
    {questionUuid: 'q-id', maximumPoints: 5, rubricId: null, expectedResponseCount: null},
    {questionUuid: 'q-essay', maximumPoints: 10, rubricId: 7, expectedResponseCount: null},
  ],
  rubrics: [{rubricId: 7, name: 'Essay', criteria: [
    {rubricCriterionId: 1, name: 'Content', maximumPoints: 6, isRequired: true},
    {rubricCriterionId: 2, name: 'Grammar', maximumPoints: 4, isRequired: false},
  ]}],
});

const objective = (mcLabel: string | null, tfLabel: string | null, tfStatus = 'detected') => [
  {regionUuid: 'r-mc', questionUuid: 'q-mc', detectionStatus: mcLabel ? 'detected' : 'blank', detectedLabel: mcLabel},
  {regionUuid: 'r-tf', questionUuid: 'q-tf', detectionStatus: tfStatus, detectedLabel: tfLabel},
];

describe('computePreliminaryScore', () => {
  test('scores MC/TF against the key, mapping True/False printed keys to stored values', () => {
    const score = computePreliminaryScore({
      reference: reference(true),
      manifest,
      objective: objective('C', 'F'),
      written: [
        {questionUuid: 'q-id', score: {mode: 'points', points: 3}},
        {questionUuid: 'q-essay', score: {mode: 'rubric', rubricId: 7, criterionScores: [
          {rubricCriterionId: 1, pointsAwarded: 5, comment: null},
          {rubricCriterionId: 2, pointsAwarded: 2.5, comment: null},
        ]}},
      ],
    });
    // MC correct (1) + TF "F" -> "B" correct (2) + identification 3 + essay 7.5
    expect(score).toEqual({earned: 13.5, maximum: 18, pendingCount: 0});
  });

  test('a wrong True/False mark scores zero even though its printed key differs from the stored value', () => {
    const score = computePreliminaryScore({
      reference: reference(true),
      manifest,
      objective: objective('A', 'T'),
      written: [
        {questionUuid: 'q-id', score: {mode: 'manual', decision: 'correct'}},
        {questionUuid: 'q-essay', score: undefined},
      ],
    });
    expect(score).toEqual({earned: 5, maximum: 18, pendingCount: 1});
  });

  test('blank, multiple, and uncertain marks score zero', () => {
    const score = computePreliminaryScore({
      reference: reference(true),
      manifest,
      objective: objective(null, 'F', 'multiple_marks'),
      written: [],
    });
    expect(score?.earned).toBe(0);
  });

  test('without answer keys, MC/TF count as pending instead of wrong', () => {
    const score = computePreliminaryScore({
      reference: reference(false),
      manifest,
      objective: objective('C', 'F'),
      written: [{questionUuid: 'q-id', score: {mode: 'points', points: 4}}],
    });
    // MC + TF pending (no key), essay pending (not scored).
    expect(score).toEqual({earned: 4, maximum: 18, pendingCount: 3});
  });

  test('a rubric missing any criterion score is still pending', () => {
    const score = computePreliminaryScore({
      reference: reference(true),
      manifest,
      objective: objective('C', 'F'),
      written: [
        {questionUuid: 'q-id', score: {mode: 'points', points: 5}},
        {questionUuid: 'q-essay', score: {mode: 'rubric', rubricId: 7, criterionScores: [
          {rubricCriterionId: 1, pointsAwarded: 6, comment: null},
        ]}},
      ],
    });
    expect(score).toEqual({earned: 8, maximum: 18, pendingCount: 1});
  });

  test('scores against the backend\'s real contract 3.1 evaluation-reference fixture', () => {
    const fixture = require('./fixtures/v3/mobile/evaluation-reference-3.1-response.json') as {
      data: V3EvaluationReference;
    };
    const [mc, tf, enumeration, essay] = fixture.data.questions;
    const fixtureManifest = {
      pages: [{regions: [
        {regionUuid: 'mc', options: ['A', 'B', 'C', 'D'].map(key => ({key, storedValue: key}))},
        {regionUuid: 'tf', options: [{key: 'T', storedValue: 'A'}, {key: 'F', storedValue: 'B'}]},
      ]}],
    } as unknown as V3AnswerSheetManifest;
    const score = computePreliminaryScore({
      reference: fixture.data,
      manifest: fixtureManifest,
      objective: [
        {regionUuid: 'mc', questionUuid: mc.questionUuid, detectionStatus: 'detected', detectedLabel: 'C'},
        {regionUuid: 'tf', questionUuid: tf.questionUuid, detectionStatus: 'detected', detectedLabel: 'F'},
      ],
      written: [
        {questionUuid: enumeration.questionUuid, score: {mode: 'points', points: 1}},
        {questionUuid: essay.questionUuid, score: {mode: 'rubric', rubricId: essay.rubricId!, criterionScores:
          fixture.data.rubrics[0].criteria.map(criterion => ({
            rubricCriterionId: criterion.rubricCriterionId,
            pointsAwarded: criterion.maximumPoints - 1,
            comment: null,
          }))}},
      ],
    });
    // MC "C" = key C (1) + TF printed "F" -> "B" = key B (1) + enumeration 1 + essay (3-1)+(2-1)=3
    expect(score).toEqual({earned: 6, maximum: 9, pendingCount: 0});
    expect(enumeration.acceptedAnswers?.map(answer => answer.text)).toEqual(['Mitochondria', 'Nucleus']);
  });

  test('scores True/False on real backend sheets, where the key is "A"/"B" and the value "True"/"False"', () => {
    const realManifest = {
      pages: [{regions: [
        {regionUuid: 'r-tf', options: [{key: 'A', storedValue: 'True'}, {key: 'B', storedValue: 'False'}]},
      ]}],
    } as unknown as V3AnswerSheetManifest;
    const realReference: V3EvaluationReference = {
      ...reference(true),
      questions: [{questionUuid: 'q-tf', maximumPoints: 2, rubricId: null, expectedResponseCount: null,
        correctOptionKey: 'B'}],
    };
    const scoreFor = (detectedLabel: string) => computePreliminaryScore({
      reference: realReference,
      manifest: realManifest,
      objective: [{regionUuid: 'r-tf', questionUuid: 'q-tf', detectionStatus: 'detected', detectedLabel}],
      written: [],
    })?.earned;
    expect(scoreFor('B')).toBe(2);
    expect(scoreFor('A')).toBe(0);
  });

  test('returns null when no evaluation reference is available', () => {
    expect(computePreliminaryScore({
      reference: null, manifest, objective: objective('C', 'F'), written: [],
    })).toBeNull();
  });
});
