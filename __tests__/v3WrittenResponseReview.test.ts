import {
  calculateV3WrittenReviewScore,
  createV3WrittenResponseReview,
  isV3WrittenReviewComplete,
  reopenV3WrittenReview,
  saveV3WrittenReviewPending,
  setV3WrittenCriterionScore,
  setV3WrittenNumericScore,
  setV3WrittenTeacherComment,
  verifyV3WrittenReview,
  type CreateV3WrittenReviewInput,
  type V3WrittenAuditContext,
  type V3WrittenResponseReview,
} from '../src/prototypes/v3WrittenResponseReview/model';

const baseInput: CreateV3WrittenReviewInput = {
  answerUuid: '7a57fbd1-5966-4d3f-ae3c-90d5c07a5ab1',
  questionId: 30003,
  itemNumber: 3,
  questionType: 'essay',
  maximumPoints: 5,
  evidence: {
    regionUuid: '52369651-c19d-4ec0-8d45-3b49a4cf0c76',
    scanPageUuid: '94552275-e6f4-42cb-a1ee-3f465606e50f',
    imageUri: 'file:///prototype/written-response.jpg',
    imageSha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    capturedAt: '2026-09-01T08:00:00Z',
  },
};

const rubric = {
  rubricId: 12,
  title: 'Short Essay Rubric',
  criteria: [
    {
      criterionId: 'content',
      name: 'Content',
      description: 'Accuracy and relevance',
      maximumPoints: 4,
    },
    {
      criterionId: 'organization',
      name: 'Organization',
      description: null,
      maximumPoints: 4,
    },
  ],
} as const;

const audit = (
  eventUuid: string,
  occurredAt: string,
): V3WrittenAuditContext => ({
  eventUuid,
  teacherUserId: 42,
  occurredAt,
});

const scoreRubricReview = (): V3WrittenResponseReview => {
  let review = createV3WrittenResponseReview({ ...baseInput, rubric });
  review = setV3WrittenCriterionScore(review, 'content', 4);
  review = setV3WrittenCriterionScore(review, 'organization', 3);
  return review;
};

describe('isolated V3 written-response scoring model', () => {
  test('uses criterion scoring for Essay and caps the total at maximumPoints', () => {
    const review = scoreRubricReview();

    expect(review.scoreMode).toBe('rubric');
    expect(isV3WrittenReviewComplete(review)).toBe(true);
    expect(calculateV3WrittenReviewScore(review)).toBe(5);
  });

  test.each(['essay', 'identification', 'enumeration'] as const)(
    'uses exact numeric fallback for %s without a rubric',
    questionType => {
      let review = createV3WrittenResponseReview({
        ...baseInput,
        questionType,
      });
      review = setV3WrittenNumericScore(review, 3.5);

      expect(review.scoreMode).toBe('numeric');
      expect(calculateV3WrittenReviewScore(review)).toBe(3.5);
      expect(isV3WrittenReviewComplete(review)).toBe(true);
    },
  );

  test('rejects a rubric for Identification or Enumeration', () => {
    expect(() =>
      createV3WrittenResponseReview({
        ...baseInput,
        questionType: 'identification',
        rubric,
      }),
    ).toThrow('Only Essay may use a rubric');
  });

  test('allows incomplete work to remain pending', () => {
    const review = createV3WrittenResponseReview(baseInput);
    const pending = saveV3WrittenReviewPending(
      review,
      audit('932932ed-78f8-491e-8f38-fb55ee263917', '2026-09-01T08:05:00Z'),
    );

    expect(pending.status).toBe('pending');
    expect(pending.auditTrail.at(-1)?.action).toBe('pending_saved');
    expect(() =>
      verifyV3WrittenReview(
        pending,
        audit('8f76c341-4596-49ef-87c2-00d4e5143bdd', '2026-09-01T08:06:00Z'),
      ),
    ).toThrow('Every required score');
  });

  test('locks score and comment changes after verification', () => {
    const scored = setV3WrittenTeacherComment(
      scoreRubricReview(),
      'Clear response.',
    );
    const verified = verifyV3WrittenReview(
      scored,
      audit('d5d1d7bd-bc1c-4c58-a20b-30c4c80048a2', '2026-09-01T08:10:00Z'),
    );

    expect(verified.status).toBe('verified');
    expect(verified.auditTrail.at(-1)).toMatchObject({
      action: 'verified',
      scoreSnapshot: 5,
    });
    expect(() => setV3WrittenCriterionScore(verified, 'content', 2)).toThrow(
      'must be reopened',
    );
    expect(() => setV3WrittenTeacherComment(verified, 'Changed')).toThrow(
      'must be reopened',
    );
  });

  test('requires an audited reason before correcting a verified score', () => {
    const verified = verifyV3WrittenReview(
      scoreRubricReview(),
      audit('38c0e693-f901-4b21-9b34-0c753c952fa4', '2026-09-01T08:15:00Z'),
    );

    expect(() =>
      reopenV3WrittenReview(
        verified,
        audit('1d38ee9d-d741-47fa-ae5d-d496068ee6af', '2026-09-01T08:20:00Z'),
        '   ',
      ),
    ).toThrow('correction reason');

    const reopened = reopenV3WrittenReview(
      verified,
      audit('64bf255e-68f0-418e-9ac0-130f9f612d09', '2026-09-01T08:21:00Z'),
      'Rubric criterion was selected incorrectly.',
    );
    const corrected = setV3WrittenCriterionScore(reopened, 'content', 2);

    expect(reopened.status).toBe('pending');
    expect(reopened.auditTrail.at(-1)).toMatchObject({
      action: 'reopened',
      reason: 'Rubric criterion was selected incorrectly.',
      scoreSnapshot: 5,
    });
    expect(calculateV3WrittenReviewScore(corrected)).toBe(5);
  });

  test('preserves the same frozen scan evidence through scoring changes', () => {
    const review = createV3WrittenResponseReview(baseInput);
    const scored = setV3WrittenNumericScore(review, 4);

    expect(Object.isFrozen(review.evidence)).toBe(true);
    expect(scored.evidence).toEqual(review.evidence);
    expect(scored.evidence.imageSha256).toBe(baseInput.evidence.imageSha256);
  });
});
