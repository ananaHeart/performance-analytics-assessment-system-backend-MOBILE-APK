import React, { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  LockKeyhole,
  Minus,
  Plus,
  RotateCcw,
  Save,
} from 'lucide-react-native';

import {
  calculateV3WrittenReviewScore,
  isV3WrittenReviewComplete,
  setV3WrittenCriterionScore,
  setV3WrittenNumericScore,
  setV3WrittenTeacherComment,
  type V3WrittenResponseReview,
} from './model';

interface WrittenResponseReviewPrototypeProps {
  review: V3WrittenResponseReview;
  scoreStep?: number;
  onReviewChange: (review: V3WrittenResponseReview) => void;
  onSavePending: (review: V3WrittenResponseReview) => void;
  onVerify: (review: V3WrittenResponseReview) => void;
  onReopen: (reason: string) => void;
}

interface ScoreStepperProps {
  accessibilityName: string;
  value: number | null;
  maximum: number;
  step: number;
  disabled: boolean;
  onChange: (value: number | null) => void;
}

const questionTypeLabels = {
  identification: 'Identification',
  enumeration: 'Enumeration',
  essay: 'Essay',
} as const;

const scoreText = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const ScoreStepper = ({
  accessibilityName,
  value,
  maximum,
  step,
  disabled,
  onChange,
}: ScoreStepperProps) => {
  const [inputValue, setInputValue] = useState(
    value === null ? '' : scoreText(value),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(value === null ? '' : scoreText(value));
  }, [value]);

  const applyValue = (nextValue: number | null) => {
    setError(null);
    setInputValue(nextValue === null ? '' : scoreText(nextValue));
    onChange(nextValue);
  };

  const commitInput = () => {
    if (inputValue.trim() === '') {
      applyValue(null);
      return;
    }
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
      setError(`Enter 0-${scoreText(maximum)}`);
      return;
    }
    applyValue(parsed);
  };

  const adjust = (direction: -1 | 1) => {
    const base = value ?? 0;
    applyValue(Math.min(maximum, Math.max(0, base + direction * step)));
  };

  return (
    <View>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          accessibilityLabel={`Decrease ${accessibilityName}`}
          disabled={disabled || value === 0}
          onPress={() => adjust(-1)}
          style={[
            styles.stepperButton,
            (disabled || value === 0) && styles.controlDisabled,
          ]}
        >
          <Minus size={18} color="#174F2A" />
        </TouchableOpacity>
        <TextInput
          accessibilityLabel={`${accessibilityName} score`}
          editable={!disabled}
          keyboardType="decimal-pad"
          onBlur={commitInput}
          onChangeText={setInputValue}
          selectTextOnFocus
          style={[styles.scoreInput, disabled && styles.inputDisabled]}
          value={inputValue}
        />
        <Text style={styles.maximumText}>/ {scoreText(maximum)}</Text>
        <TouchableOpacity
          accessibilityLabel={`Increase ${accessibilityName}`}
          disabled={disabled || value === maximum}
          onPress={() => adjust(1)}
          style={[
            styles.stepperButton,
            (disabled || value === maximum) && styles.controlDisabled,
          ]}
        >
          <Plus size={18} color="#174F2A" />
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
};

export const WrittenResponseReviewPrototype = ({
  review,
  scoreStep = 1,
  onReviewChange,
  onSavePending,
  onVerify,
  onReopen,
}: WrittenResponseReviewPrototypeProps) => {
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const locked = review.status === 'verified';
  const currentScore = calculateV3WrittenReviewScore(review);
  const complete = isV3WrittenReviewComplete(review);

  const submitReopen = () => {
    const reason = reopenReason.trim();
    if (!reason) {
      setReopenError('Correction reason is required.');
      return;
    }
    setReopenError(null);
    setShowReopen(false);
    setReopenReason('');
    onReopen(reason);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Written Response Review</Text>
          <Text style={styles.subtitle}>
            Item {review.itemNumber} · {questionTypeLabels[review.questionType]}
          </Text>
        </View>
        <View
          style={[
            styles.statusIndicator,
            locked ? styles.statusVerified : styles.statusPending,
          ]}
        >
          <Text style={styles.statusText}>
            {locked ? 'Verified' : 'Pending'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Student response</Text>
          <LockKeyhole size={17} color="#0F7A34" />
        </View>
        <Image
          accessibilityLabel="Scanned written response"
          resizeMode="contain"
          source={{ uri: review.evidence.imageUri }}
          style={styles.evidenceImage}
        />
        <View style={styles.evidenceStatus}>
          <LockKeyhole size={15} color="#0F7A34" />
          <Text style={styles.evidenceStatusText}>Original scan evidence</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.scoreHeading}>
          <Text style={styles.sectionTitle}>Score</Text>
          <Text style={styles.totalScore}>
            {currentScore === null ? '—' : scoreText(currentScore)} /{' '}
            {scoreText(review.maximumPoints)}
          </Text>
        </View>

        {review.scoreMode === 'rubric' && review.rubric ? (
          <View style={styles.rubricList}>
            <Text style={styles.rubricTitle}>{review.rubric.title}</Text>
            {review.rubric.criteria.map(criterion => (
              <View key={criterion.criterionId} style={styles.criterionRow}>
                <View style={styles.criterionCopy}>
                  <Text style={styles.criterionName}>{criterion.name}</Text>
                  {criterion.description ? (
                    <Text style={styles.criterionDescription}>
                      {criterion.description}
                    </Text>
                  ) : null}
                </View>
                <ScoreStepper
                  accessibilityName={criterion.name}
                  disabled={locked}
                  maximum={criterion.maximumPoints}
                  onChange={score =>
                    onReviewChange(
                      setV3WrittenCriterionScore(
                        review,
                        criterion.criterionId,
                        score,
                      ),
                    )
                  }
                  step={scoreStep}
                  value={review.criterionScores[criterion.criterionId] ?? null}
                />
              </View>
            ))}
            <Text style={styles.capText}>
              Maximum recorded score: {scoreText(review.maximumPoints)}
            </Text>
          </View>
        ) : (
          <View style={styles.numericScoreRow}>
            <Text style={styles.numericScoreLabel}>
              {questionTypeLabels[review.questionType]} score
            </Text>
            <ScoreStepper
              accessibilityName={questionTypeLabels[review.questionType]}
              disabled={locked}
              maximum={review.maximumPoints}
              onChange={score =>
                onReviewChange(setV3WrittenNumericScore(review, score))
              }
              step={scoreStep}
              value={review.numericScore}
            />
          </View>
        )}

        <Text style={styles.commentLabel}>Teacher comment</Text>
        <TextInput
          accessibilityLabel="Teacher comment"
          editable={!locked}
          multiline
          onChangeText={teacherComment =>
            onReviewChange(setV3WrittenTeacherComment(review, teacherComment))
          }
          placeholder="Optional comment"
          placeholderTextColor="#8A98A5"
          style={[styles.commentInput, locked && styles.inputDisabled]}
          textAlignVertical="top"
          value={review.teacherComment}
        />

        {locked ? (
          <View style={styles.verifiedPanel}>
            <View style={styles.verifiedCopy}>
              <LockKeyhole size={17} color="#0F7A34" />
              <Text style={styles.verifiedText}>Verified score locked</Text>
            </View>
            {showReopen ? (
              <View style={styles.reopenForm}>
                <TextInput
                  accessibilityLabel="Correction reason"
                  multiline
                  onChangeText={setReopenReason}
                  placeholder="Correction reason"
                  placeholderTextColor="#8A98A5"
                  style={styles.reopenInput}
                  value={reopenReason}
                />
                {reopenError ? (
                  <Text style={styles.fieldError}>{reopenError}</Text>
                ) : null}
                <View style={styles.reopenActions}>
                  <TouchableOpacity
                    accessibilityLabel="Cancel reopen"
                    onPress={() => {
                      setShowReopen(false);
                      setReopenError(null);
                    }}
                    style={styles.compactOutlineButton}
                  >
                    <Text style={styles.compactOutlineText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel="Confirm reopen"
                    onPress={submitReopen}
                    style={styles.compactPrimaryButton}
                  >
                    <RotateCcw size={16} color="#FFFFFF" />
                    <Text style={styles.compactPrimaryText}>Reopen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                accessibilityLabel="Reopen verified scoring"
                onPress={() => setShowReopen(true)}
                style={styles.reopenButton}
              >
                <RotateCcw size={17} color="#174F2A" />
                <Text style={styles.reopenButtonText}>Reopen scoring</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </ScrollView>

      {!locked ? (
        <View style={styles.footer}>
          <TouchableOpacity
            accessibilityLabel="Save review as pending"
            onPress={() => onSavePending(review)}
            style={styles.pendingButton}
          >
            <Save size={18} color="#174F2A" />
            <Text style={styles.pendingButtonText}>Save pending</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Verify written response"
            disabled={!complete}
            onPress={() => onVerify(review)}
            style={[
              styles.verifyButton,
              !complete && styles.verifyButtonDisabled,
            ]}
          >
            <Check size={19} color="#FFFFFF" />
            <Text style={styles.verifyButtonText}>Verify</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7F8' },
  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE4E1',
    backgroundColor: '#FFFFFF',
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#102033' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 3 },
  statusIndicator: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusPending: { backgroundColor: '#FFF2D5' },
  statusVerified: { backgroundColor: '#E5F8EA' },
  statusText: { fontSize: 12, fontWeight: '800', color: '#344054' },
  content: { padding: 16, paddingBottom: 32 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#102033' },
  evidenceImage: {
    width: '100%',
    aspectRatio: 2.2,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#D5DDDA',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  evidenceStatus: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: '#EAF9EE',
  },
  evidenceStatusText: { fontSize: 12, fontWeight: '800', color: '#0F7A34' },
  divider: { height: 1, marginVertical: 20, backgroundColor: '#DDE4E1' },
  scoreHeading: { flexDirection: 'row', alignItems: 'center' },
  totalScore: {
    marginLeft: 'auto',
    fontSize: 18,
    fontWeight: '900',
    color: '#0F7A34',
  },
  rubricList: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#DDE4E1' },
  rubricTitle: {
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '800',
    color: '#344054',
  },
  criterionRow: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E4E9E7',
  },
  criterionCopy: { marginBottom: 10 },
  criterionName: { fontSize: 14, fontWeight: '800', color: '#102033' },
  criterionDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    marginTop: 3,
  },
  stepperRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  stepperButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B9C8C0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  scoreInput: {
    width: 64,
    height: 42,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#B9C8C0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    color: '#102033',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  maximumText: { width: 44, fontSize: 13, fontWeight: '700', color: '#64748B' },
  controlDisabled: { opacity: 0.4 },
  inputDisabled: { backgroundColor: '#EDF1F0', color: '#687680' },
  fieldError: { fontSize: 11, color: '#B42318', marginTop: 4 },
  capText: { fontSize: 11, color: '#64748B', marginTop: 8 },
  numericScoreRow: { marginTop: 14 },
  numericScoreLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#344054',
    marginBottom: 8,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#344054',
    marginTop: 20,
  },
  commentInput: {
    minHeight: 92,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#B9C8C0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    color: '#102033',
    fontSize: 14,
    lineHeight: 20,
  },
  verifiedPanel: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#B9DCC3',
    borderRadius: 6,
    backgroundColor: '#F1FAF3',
  },
  verifiedCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verifiedText: { fontSize: 13, fontWeight: '800', color: '#0F7A34' },
  reopenButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#AFC7B7',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  reopenButtonText: { fontSize: 13, fontWeight: '800', color: '#174F2A' },
  reopenForm: { marginTop: 12 },
  reopenInput: {
    minHeight: 70,
    padding: 10,
    borderWidth: 1,
    borderColor: '#B9C8C0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    color: '#102033',
    textAlignVertical: 'top',
  },
  reopenActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  compactOutlineButton: {
    minWidth: 80,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B9C8C0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  compactOutlineText: { fontSize: 12, fontWeight: '800', color: '#526271' },
  compactPrimaryButton: {
    minWidth: 104,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 6,
    backgroundColor: '#174F2A',
  },
  compactPrimaryText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#DDE4E1',
    backgroundColor: '#FFFFFF',
  },
  pendingButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#B9C8C0',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  pendingButtonText: { fontSize: 13, fontWeight: '800', color: '#174F2A' },
  verifyButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 7,
    backgroundColor: '#2DCE4A',
  },
  verifyButtonDisabled: { backgroundColor: '#A7B8AD' },
  verifyButtonText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
});
