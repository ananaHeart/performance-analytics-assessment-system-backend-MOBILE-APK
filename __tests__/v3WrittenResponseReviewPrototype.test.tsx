import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { WrittenResponseReviewPrototype } from '../src/prototypes/v3WrittenResponseReview/WrittenResponseReviewPrototype';
import {
  createV3WrittenResponseReview,
  setV3WrittenCriterionScore,
  verifyV3WrittenReview,
} from '../src/prototypes/v3WrittenResponseReview/model';

const createEssayReview = () =>
  createV3WrittenResponseReview({
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
    rubric: {
      rubricId: 12,
      title: 'Short Essay Rubric',
      criteria: [
        {
          criterionId: 'content',
          name: 'Content',
          description: 'Accuracy and relevance',
          maximumPoints: 3,
        },
        {
          criterionId: 'organization',
          name: 'Organization',
          description: null,
          maximumPoints: 2,
        },
      ],
    },
  });

const callbacks = {
  onReviewChange: jest.fn(),
  onSavePending: jest.fn(),
  onVerify: jest.fn(),
  onReopen: jest.fn(),
};

describe('WrittenResponseReviewPrototype', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders rubric steppers, evidence, pending action, and no slider control', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <WrittenResponseReviewPrototype
          {...callbacks}
          review={createEssayReview()}
        />,
      );
    });

    const root = renderer!.root;
    expect(
      root.findByProps({ accessibilityLabel: 'Scanned written response' }),
    ).toBeTruthy();
    expect(
      root.findByProps({ accessibilityLabel: 'Content score' }),
    ).toBeTruthy();
    expect(
      root.findByProps({ accessibilityLabel: 'Organization score' }),
    ).toBeTruthy();
    expect(
      root.findByProps({ accessibilityLabel: 'Save review as pending' }),
    ).toBeTruthy();
    expect(root.findAllByType(TextInput).length).toBe(3);

    const verifyButton = root.findByProps({
      accessibilityLabel: 'Verify written response',
    });
    expect(verifyButton.props.disabled).toBe(true);
    expect(root.findAllByProps({ role: 'slider' })).toHaveLength(0);
  });

  test('locks scoring after verification and exposes audited reopen action', async () => {
    let review = createEssayReview();
    review = setV3WrittenCriterionScore(review, 'content', 3);
    review = setV3WrittenCriterionScore(review, 'organization', 2);
    review = verifyV3WrittenReview(review, {
      eventUuid: '38c0e693-f901-4b21-9b34-0c753c952fa4',
      teacherUserId: 42,
      occurredAt: '2026-09-01T08:15:00Z',
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <WrittenResponseReviewPrototype {...callbacks} review={review} />,
      );
    });

    const root = renderer!.root;
    expect(
      root.findByProps({ accessibilityLabel: 'Reopen verified scoring' }),
    ).toBeTruthy();
    expect(
      root.findAllByProps({ accessibilityLabel: 'Verify written response' }),
    ).toHaveLength(0);

    const scoreInputs = root
      .findAllByType(TextInput)
      .filter(input => input.props.accessibilityLabel?.endsWith(' score'));
    expect(scoreInputs.every(input => input.props.editable === false)).toBe(
      true,
    );
    expect(
      root
        .findAllByType(TouchableOpacity)
        .filter(button =>
          button.props.accessibilityLabel?.startsWith('Increase '),
        )
        .every(button => button.props.disabled === true),
    ).toBe(true);
  });
});
