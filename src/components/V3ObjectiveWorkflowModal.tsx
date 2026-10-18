import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Camera,
  CircleCheck,
  CloudUpload,
  Image as ImageIcon,
  Minus,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react-native';

import {initV3Database} from '../database/v3/database';
import {
  deleteV3ObjectiveOutbox,
  getV3ObjectiveCaptureContext,
  getV3ObjectiveOutbox,
  getV3ObjectiveRegions,
  getV3ObjectiveStudents,
  queueV3ObjectiveScan,
  type V3ObjectiveCaptureContext,
  type V3ObjectiveRegion,
  type V3ObjectiveStudent,
} from '../database/v3/objectiveRepository';
import {
  deleteV3DynamicObjectiveOutbox,
  getV3DynamicObjectiveOutbox,
  getV3DynamicWrittenRegions,
  queueV3DynamicScan,
  updateV3DynamicWrittenScores,
  v3DynamicUploadStarted,
  type V3DynamicObjectiveOutboxRecord,
  type V3DynamicWrittenScore,
} from '../database/v3/dynamicObjectiveRepository';
import type {V3AnswerSheetManifest, V3ManifestOptionCoordinate} from '../database/v3/contracts';
import {
  getV3CachedAnswerSheetManifest,
  saveV3AnswerSheetManifest,
} from '../database/v3/manifestRepository';
import {purgeClosedV3EvaluationReferenceCache} from '../database/v3/evaluationReferenceCache';
import {captureOmrSheet, chooseOmrImage, type OmrScanResult} from '../native/omrScanner';
import {
  captureDynamicOmrSheet,
  chooseDynamicOmrImage,
  type DynamicOmrScanResult,
} from '../native/dynamicOmrScanner';
import type {V3AuthSession} from '../services/v3/authClient';
import {buildDynamicScannerManifestJson} from '../services/v3/dynamicManifestAdapter';
import {V3_BASE_URL} from '../services/v3/diagnosticsConnection';
import {createV3MobileReadClient} from '../services/v3/mobileReadClient';
import {createV3OfflineDataService} from '../services/v3/offlineDataService';
import {V3ObjectiveHttpError} from '../services/v3/objectiveClient';
import {syncV3ObjectiveResult} from '../services/v3/objectiveSyncService';
import {syncV3DynamicObjectiveResult} from '../services/v3/dynamicObjectiveSyncService';
import {
  createV3DynamicVerificationClient,
  type V3EvaluationReference,
  type V3EvaluationReferenceQuestion,
  type V3EvaluationReferenceRubric,
} from '../services/v3/dynamicVerificationClient';
import {
  cacheV3EvaluationReference,
  loadCachedV3EvaluationReference,
} from '../services/v3/evaluationReferenceStore';
import {computePreliminaryScore, type PreliminaryScore} from '../services/v3/preliminaryScore';
import {V3ServerWakingNotice} from './V3ServerWakingNotice';
import {V3StatusToast} from './V3StatusToast';
import {theme} from '../theme/tokens';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  FooterRow,
  IconButton,
  ListRow,
  ProgressBar,
  ScreenHeader,
  SearchField,
  StickyFooter,
  useDialog,
} from './ui';

const FIXED_MC_TEMPLATE_CODE = 'OMR-A4-10-MC-CTX-V2';
const DYNAMIC_MINIMUM_QUESTIONS = 5;

interface Props {
  visible: boolean;
  session: V3AuthSession;
  test: {
    test_id: number;
    test_assignment_id: number;
    assignment_uuid: string;
    test_name?: string;
    total_items?: number;
  };
  classData: {class_id: number; grade_level_name?: string; section_name?: string};
  onClose: () => void;
  onChanged: () => void;
  onSessionInvalid: () => void;
}

// Roster names arrive in whatever case the school's enrollment data used
// (often a mix of ALL CAPS and Title Case in the same class) - always display
// them in sentence/title case rather than showing that inconsistency verbatim.
const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_match, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`);

const studentName = (student: V3ObjectiveStudent): string =>
  [student.lastName, student.firstName].filter(Boolean).map(toTitleCase).join(', ');

const scoreText = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

/**
 * One rubric criterion's point entry: -/+ steppers by 1 plus a direct numeric
 * field for finer values, clamped to [0, maximum]. Deliberately local state
 * for the text field (not driven straight off `value`) so a teacher can clear
 * the box and type a fresh number without it fighting them mid-edit; it
 * re-syncs from `value` whenever that changes from outside (e.g. the +/-
 * buttons, or switching to a different criterion's row reusing this component
 * type).
 */
const CriterionScoreStepper = ({
  value,
  maximum,
  disabled,
  onChange,
}: {
  value: number | null;
  maximum: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) => {
  const [inputValue, setInputValue] = useState(value === null ? '' : scoreText(value));
  useEffect(() => {
    setInputValue(value === null ? '' : scoreText(value));
  }, [value]);
  const commit = () => {
    const parsed = Number(inputValue);
    if (inputValue.trim() === '' || !Number.isFinite(parsed)) {
      setInputValue(value === null ? '' : scoreText(value));
      return;
    }
    onChange(Math.max(0, Math.min(maximum, parsed)));
  };
  const adjust = (direction: -1 | 1) => {
    const base = value ?? 0;
    onChange(Math.max(0, Math.min(maximum, base + direction)));
  };
  return (
    <View style={styles.criterionStepperRow}>
      <IconButton
        icon={Minus}
        accessibilityLabel="One point less"
        style={styles.stepperButton}
        onPress={() => adjust(-1)}
        disabled={disabled || value === 0}
      />
      <TextInput
        style={[styles.criterionScoreInput, disabled && styles.inputDisabled]}
        value={inputValue}
        onChangeText={setInputValue}
        onBlur={commit}
        editable={!disabled}
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={`Points, out of ${scoreText(maximum)}`}
      />
      <Text style={styles.criterionMaxText}>/ {scoreText(maximum)}</Text>
      <IconButton
        icon={Plus}
        accessibilityLabel="One point more"
        style={styles.stepperButton}
        onPress={() => adjust(1)}
        disabled={disabled || value === maximum}
      />
    </View>
  );
};

/**
 * Matches what the backend will accept: an essay with a rubric needs a score
 * for every criterion (not just the isRequired ones - it rejects the item
 * with RUBRIC_SCORE_INCOMPLETE otherwise), and a question with a rubric can't
 * be sent as a plain Right/Wrong score at all (RUBRIC_REQUIRED).
 */
const isWrittenScoreComplete = (
  score: V3DynamicWrittenScore | undefined,
  rubric: V3EvaluationReferenceRubric | null,
): boolean => {
  if (!score) return false;
  if (!rubric) return score.mode !== 'rubric';
  if (score.mode !== 'rubric') return false;
  const scored = new Set(score.criterionScores.map(entry => entry.rubricCriterionId));
  return rubric.criteria.every(criterion => scored.has(criterion.rubricCriterionId));
};

const withCriterionScore = (
  score: V3DynamicWrittenScore | undefined,
  rubricId: number,
  rubricCriterionId: number,
  pointsAwarded: number,
): V3DynamicWrittenScore => {
  const previous = score?.mode === 'rubric' ? score.criterionScores : [];
  return {
    mode: 'rubric',
    rubricId,
    criterionScores: [
      ...previous.filter(entry => entry.rubricCriterionId !== rubricCriterionId),
      {rubricCriterionId, pointsAwarded, comment: null},
    ],
  };
};

const preliminaryForSavedRecord = (
  record: V3DynamicObjectiveOutboxRecord,
  reference: V3EvaluationReference | null,
  manifest: V3AnswerSheetManifest | null,
  scoresByItemNumber?: Record<number, V3DynamicWrittenScore>,
): PreliminaryScore | null => computePreliminaryScore({
  reference,
  manifest,
  objective: record.objectiveDetections.map(detection => ({
    regionUuid: detection.regionUuid,
    questionUuid: detection.questionUuid,
    detectionStatus: detection.detectionStatus,
    // A saved record keeps the printed key in detectedOption (queueV3DynamicScan).
    detectedLabel: detection.detectedOption,
  })),
  written: record.writtenAnswers.map(answer => ({
    questionUuid: answer.questionUuid,
    score: scoresByItemNumber ? scoresByItemNumber[answer.itemNumber] : answer.score,
  })),
});

interface PillOption {
  key: string;
  label: string;
}

const FALLBACK_TRUE_FALSE_PILLS: PillOption[] = [{key: 'A', label: 'T'}, {key: 'B', label: 'F'}];
const FALLBACK_MULTIPLE_CHOICE_PILLS: PillOption[] =
  ['A', 'B', 'C', 'D'].map(key => ({key, label: key}));

/**
 * True/False options are printed as T and F, but their manifest key varies:
 * real backend sheets use key "A"/"B" with value "True"/"False", older
 * sample sheets used key "T"/"F". Show T/F either way.
 */
const trueFalseLabel = (option: V3ManifestOptionCoordinate, index: number): string => {
  const value = option.storedValue.trim().toLowerCase();
  if (value === 'true' || value === 't') return 'T';
  if (value === 'false' || value === 'f') return 'F';
  const key = option.key.trim().toUpperCase();
  if (key === 'T' || key === 'F') return key;
  return index === 0 ? 'T' : 'F';
};

// "Partial" until the result is sent: the score only becomes official on the web.
const preliminaryLabel = (score: PreliminaryScore | undefined): string =>
  score
    ? ` · Preliminary ${scoreText(score.earned)}/${scoreText(score.maximum)} (partial)`
    : '';

// Pinned in the screen header, so the running total stays in view while the
// teacher scrolls through the items below.
const HeaderScore = ({score}: {score: PreliminaryScore | null}) => {
  if (!score) return null;
  const total = `${scoreText(score.earned)}/${scoreText(score.maximum)}`;
  return <Badge label={`${total} partial`} tone="success" accessibilityLabel={`Partial score ${total}`} />;
};

const PreliminaryScoreBanner = ({score}: {score: PreliminaryScore | null}) => {
  if (!score) return null;
  const pending = score.pendingCount;
  return (
    <Banner tone="success" icon={null} style={styles.sectionSpacing}>
      <View style={styles.preliminaryHeader}>
        <Text style={styles.preliminaryLabel}>Preliminary score (partial)</Text>
        <Text style={styles.preliminaryValue}>
          {scoreText(score.earned)} / {scoreText(score.maximum)}
        </Text>
      </View>
      <Text style={styles.preliminaryHint}>
        {pending > 0 ? `${pending} item${pending === 1 ? '' : 's'} still to score. ` : ''}
        Scored with the answer key on this phone. The same score is saved on the web when
        you send it.
      </Text>
    </Banner>
  );
};

/**
 * One written answer's scoring controls. Essays with a rubric get a score per
 * criterion; everything else gets Right/Wrong (full or zero points), plus a
 * points stepper for partial credit when the item is worth more than 1 point.
 * If the question's points aren't known on this phone yet (no evaluation
 * reference downloaded), it falls back to a bare Right/Wrong resolved at upload.
 */
const WrittenScoringCard = ({
  itemNumber,
  questionType,
  imageUri,
  score,
  question,
  rubric,
  disabled,
  onChange,
}: {
  itemNumber: number;
  questionType: string;
  imageUri: string;
  score: V3DynamicWrittenScore | undefined;
  question: V3EvaluationReferenceQuestion | undefined;
  rubric: V3EvaluationReferenceRubric | null;
  disabled: boolean;
  onChange: (score: V3DynamicWrittenScore) => void;
}) => {
  const acceptedAnswers = question?.acceptedAnswers ?? [];
  const maximumPoints = question?.maximumPoints ?? null;
  const points = score?.mode === 'points'
    ? score.points
    : score?.mode === 'manual' && maximumPoints != null
      ? score.decision === 'correct' ? maximumPoints : 0
      : null;
  const isRight = maximumPoints == null
    ? score?.mode === 'manual' && score.decision === 'correct'
    : points === maximumPoints;
  const isWrong = maximumPoints == null
    ? score?.mode === 'manual' && score.decision === 'incorrect'
    : points === 0;
  const rubricTotal = score?.mode === 'rubric'
    ? score.criterionScores.reduce((total, entry) => total + entry.pointsAwarded, 0)
    : 0;
  const rubricMaximum = rubric
    ? maximumPoints ?? rubric.criteria.reduce((total, criterion) => total + criterion.maximumPoints, 0)
    : 0;

  return (
    <Card style={styles.sectionSpacing}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemNumber}>Q{itemNumber}</Text>
        <Text style={styles.itemMeta}>
          {questionType}{maximumPoints != null ? ` · ${scoreText(maximumPoints)} pt` : ''}
        </Text>
      </View>
      <Image
        source={{uri: imageUri}}
        style={styles.writtenEvidenceImage}
        resizeMode="contain"
        accessibilityLabel={`Student's written answer for question ${itemNumber}`}
      />
      {acceptedAnswers.length > 0 ? (
        <View style={styles.acceptedAnswersBox}>
          <Text style={styles.acceptedAnswersLabel}>
            {acceptedAnswers.length > 1 ? 'Accepted answers' : 'Accepted answer'}
          </Text>
          {acceptedAnswers.map((answer, index) => (
            <Text key={`${index}-${answer.text}`} style={styles.acceptedAnswerText}>
              • {answer.text}{acceptedAnswers.length > 1 ? ` (${scoreText(answer.points)} pt)` : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {rubric ? (
        <View style={styles.rubricList}>
          <View style={styles.itemHeader}>
            <Text style={styles.rubricTitle}>{rubric.name}</Text>
            <Text style={styles.rubricTotal}>
              {scoreText(rubricTotal)} / {scoreText(rubricMaximum)}
            </Text>
          </View>
          {rubric.criteria.map(criterion => {
            const criterionScore = score?.mode === 'rubric'
              ? score.criterionScores.find(
                  entry => entry.rubricCriterionId === criterion.rubricCriterionId,
                )?.pointsAwarded ?? null
              : null;
            return (
              <View style={styles.criterionRow} key={criterion.rubricCriterionId}>
                <Text style={styles.criterionName}>{criterion.name}</Text>
                {criterion.description ? (
                  <Text style={styles.criterionDescription}>{criterion.description}</Text>
                ) : null}
                <CriterionScoreStepper
                  value={criterionScore}
                  maximum={criterion.maximumPoints}
                  disabled={disabled}
                  onChange={value => onChange(
                    withCriterionScore(score, rubric.rubricId, criterion.rubricCriterionId, value),
                  )}
                />
              </View>
            );
          })}
        </View>
      ) : (
        <>
          <View style={styles.scoreButtonRow}>
            <Button
              label="Wrong"
              icon={XCircle}
              variant={isWrong ? 'dangerOutline' : 'secondary'}
              style={[styles.scoreButton, isWrong && styles.scoreButtonWrongActive]}
              onPress={() => onChange(
                maximumPoints == null ? {mode: 'manual', decision: 'incorrect'} : {mode: 'points', points: 0},
              )}
              disabled={disabled}
              accessibilityLabel={`Question ${itemNumber}: Wrong${isWrong ? ', selected' : ''}`}
            />
            <Button
              label="Right"
              icon={CircleCheck}
              variant={isRight ? 'primary' : 'secondary'}
              style={styles.scoreButton}
              onPress={() => onChange(
                maximumPoints == null
                  ? {mode: 'manual', decision: 'correct'}
                  : {mode: 'points', points: maximumPoints},
              )}
              disabled={disabled}
              accessibilityLabel={`Question ${itemNumber}: Right${isRight ? ', selected' : ''}`}
            />
          </View>
          {maximumPoints != null && maximumPoints > 1 ? (
            <View style={styles.partialPointsRow}>
              <Text style={styles.partialPointsLabel}>Points (partial credit)</Text>
              <CriterionScoreStepper
                value={points}
                maximum={maximumPoints}
                disabled={disabled}
                onChange={value => onChange({mode: 'points', points: value})}
              />
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
};

export const V3ObjectiveWorkflowModal = ({
  visible,
  session,
  test,
  classData,
  onClose,
  onChanged,
  onSessionInvalid,
}: Props): React.JSX.Element => {
  const dialog = useDialog();
  const [students, setStudents] = useState<V3ObjectiveStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<V3ObjectiveStudent | null>(null);
  const [context, setContext] = useState<V3ObjectiveCaptureContext | null>(null);
  const [regions, setRegions] = useState<V3ObjectiveRegion[]>([]);
  const [scan, setScan] = useState<OmrScanResult | null>(null);
  // Accumulates one entry per physically captured page of a multi-page dynamic
  // sheet (keyed implicitly by identity.pageNumber) - a single scan action only
  // captures one page, so a 2-page sheet needs two capture rounds before the
  // combined result is complete.
  const [dynamicPages, setDynamicPages] = useState<DynamicOmrScanResult[]>([]);
  // The manifest fetched for the most recent dynamic capture - kept around (not
  // re-fetched) so queueV3DynamicScan can read each page's real qrPayloadHash.
  const [dynamicManifest, setDynamicManifest] = useState<V3AnswerSheetManifest | null>(null);
  // Loaded once per assessment (fresh when online, else the phone's cached
  // copy): per-question points, rubrics, and - once contract 3.1 is live -
  // answer keys. Drives the scoring UI and the display-only preliminary score.
  // Never used for uploads: sync always re-fetches its own fresh copy, since
  // the backend rejects a stale hash.
  const [evaluationReference, setEvaluationReference] = useState<V3EvaluationReference | null>(null);
  // Points for identification/enumeration and essay-without-a-rubric; an
  // explicit score per criterion for essays with a rubric (mandatory once
  // assigned - the backend hard-rejects Manual for those). Keyed by item number.
  const [writtenScores, setWrittenScores] = useState<Record<number, V3DynamicWrittenScore>>({});
  // A saved-but-not-yet-uploaded result reopened to change its written scores.
  const [editing, setEditing] = useState<{
    record: V3DynamicObjectiveOutboxRecord;
    scores: Record<number, V3DynamicWrittenScore>;
    dirty: boolean;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What "Try again" re-runs. Tied to the exact error text it belongs to, so a
  // later error without a retry never shows a stale button.
  const [retry, setRetry] = useState<{error: string; run: () => void} | null>(null);
  const showError = (text: string, run?: () => void) => {
    setError(text);
    setRetry(run ? {error: text, run} : null);
  };
  const dismissMessage = useCallback(() => setMessage(null), []);
  const dismissError = useCallback(() => {
    setError(null);
    setRetry(null);
  }, []);
  const [bulkSync, setBulkSync] = useState<{
    total: number;
    completed: number;
    failed: {name: string; reason: string}[];
  } | null>(null);

  // Re-reads this screen from the phone's database only. Used after local
  // saves, edits, discards and uploads, which change nothing a download would
  // bring back - on sleeping free hosting a full re-download there costs
  // minutes for no new data.
  const refreshLocal = useCallback(() => {
    const nextStudents = getV3ObjectiveStudents(test.test_assignment_id, classData.class_id);
    setStudents(nextStudents);
    setSelected(current => current
      ? nextStudents.find(item => item.classListId === current.classListId) ?? null
      : null);
    setContext(getV3ObjectiveCaptureContext(test.test_assignment_id));
    setRegions(getV3ObjectiveRegions(test.test_assignment_id));
  }, [classData.class_id, test.test_assignment_id]);

  // Opening the screen: one download (answer sheets, availability, answer
  // keys), then the local read above.
  const load = useCallback(async () => {
    await initV3Database();
    // Show what's already on the phone right away; a sleeping server can take
    // a minute or two to answer the download below.
    refreshLocal();
    try {
      // The local answer_sheet_versions mirror (read below by
      // getV3ObjectiveCaptureContext) is only ever updated here - a backend
      // regeneration (new answer_sheet_version, new UUID, old one retired)
      // is otherwise invisible to this device, and it kept requesting the
      // manifest with a retired answerSheetUuid, 404ing forever. Best-effort:
      // scanning/saving must keep working offline, only this refresh needs
      // a connection, so a failure here just falls back to whatever's cached.
      const readClient = createV3MobileReadClient({
        baseUrl: V3_BASE_URL,
        getSessionToken: () => session.accessToken,
      });
      await createV3OfflineDataService(readClient).refreshOfflineBaseline();
    } catch {
      // Offline or backend unreachable - continue with whatever is cached.
    }
    // The refresh above updates each assignment's capture availability, so
    // this is where cached answer keys for newly closed assessments go away.
    purgeClosedV3EvaluationReferenceCache();
    let reference: V3EvaluationReference | null = null;
    try {
      reference = await createV3DynamicVerificationClient(
        V3_BASE_URL,
        session.accessToken,
      ).getEvaluationReference(test.assignment_uuid);
    } catch {
      reference = await loadCachedV3EvaluationReference(test.assignment_uuid);
    }
    if (reference) {
      // Saving is best-effort: a failure only costs offline use later, never
      // the fresh copy already in hand.
      await cacheV3EvaluationReference(reference).catch(() => undefined);
    }
    setEvaluationReference(reference);
    refreshLocal();
  }, [refreshLocal, test.assignment_uuid, session.accessToken]);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setScan(null);
      setDynamicPages([]);
      setDynamicManifest(null);
      setEvaluationReference(null);
      setEditing(null);
      setWrittenScores({});
      setMessage(null);
      setError(null);
      setSearchQuery('');
      return;
    }
    load().catch(loadError => setError(
      loadError instanceof Error ? loadError.message : 'Unable to read the V3 offline workflow.',
    ));
  }, [load, visible]);

  const isDynamicTemplate = context ? context.templateCode !== FIXED_MC_TEMPLATE_CODE : false;

  const dynamicTotalPages = dynamicPages[0]?.identity.totalPages ?? null;
  // Known from the downloaded manifest before any page is captured - lets the
  // teacher see the page count upfront instead of discovering it one scan at
  // a time. Once a page is captured, dynamicTotalPages (from that page's own
  // identity) takes over as the authoritative source.
  const knownTotalPages = dynamicTotalPages ?? context?.totalPages ?? null;
  const isDynamicCaptureComplete =
    dynamicTotalPages !== null && dynamicPages.length >= dynamicTotalPages;
  const nextMissingPageNumber = useMemo(() => {
    if (!dynamicTotalPages) return 1;
    const captured = new Set(dynamicPages.map(page => page.identity.pageNumber));
    for (let pageNumber = 1; pageNumber <= dynamicTotalPages; pageNumber += 1) {
      if (!captured.has(pageNumber)) return pageNumber;
    }
    return null;
  }, [dynamicPages, dynamicTotalPages]);
  const combinedObjectiveDetections = useMemo(
    () => dynamicPages.flatMap(page => page.objectiveDetections)
      .sort((a, b) => a.itemNumber - b.itemNumber),
    [dynamicPages],
  );
  const combinedWrittenEvidence = useMemo(
    () => dynamicPages.flatMap(page => page.writtenEvidence)
      .sort((a, b) => a.itemNumber - b.itemNumber),
    [dynamicPages],
  );
  const questionByUuid = useMemo(
    () => new Map((evaluationReference?.questions ?? []).map(question => [question.questionUuid, question])),
    [evaluationReference],
  );
  const rubricById = useMemo(
    () => new Map((evaluationReference?.rubrics ?? []).map(rubric => [rubric.rubricId, rubric])),
    [evaluationReference],
  );
  const rubricForQuestion = useCallback((questionUuid: string): V3EvaluationReferenceRubric | null => {
    const rubricId = questionByUuid.get(questionUuid)?.rubricId;
    return rubricId == null ? null : rubricById.get(rubricId) ?? null;
  }, [questionByUuid, rubricById]);
  const scoredWrittenCount = useMemo(
    () => combinedWrittenEvidence.filter(evidence => isWrittenScoreComplete(
      writtenScores[evidence.itemNumber],
      rubricForQuestion(evidence.questionUuid),
    )).length,
    [combinedWrittenEvidence, writtenScores, rubricForQuestion],
  );
  // Pill options per region from the manifest: `key` is what the scanner
  // reports and is compared against; `label` is what the paper shows.
  const pillOptionsByRegion = useMemo(() => {
    const options = new Map<string, PillOption[]>();
    dynamicManifest?.pages.forEach(page => page.regions.forEach(region => {
      options.set(region.regionUuid, region.options.map((option, index) => ({
        key: option.key,
        label: region.questionType === 'true_false' ? trueFalseLabel(option, index) : option.key,
      })));
    }));
    return options;
  }, [dynamicManifest]);
  const reviewPreliminary = useMemo(() => computePreliminaryScore({
    reference: evaluationReference,
    manifest: dynamicManifest,
    objective: combinedObjectiveDetections.map(detection => ({
      regionUuid: detection.regionUuid,
      questionUuid: detection.questionUuid,
      detectionStatus: detection.detectionStatus,
      detectedLabel: detection.detectedLabel,
    })),
    written: combinedWrittenEvidence.map(evidence => ({
      questionUuid: evidence.questionUuid,
      score: writtenScores[evidence.itemNumber],
    })),
  }), [evaluationReference, dynamicManifest, combinedObjectiveDetections, combinedWrittenEvidence, writtenScores]);
  // Preliminary scores for saved results still waiting to upload, recomputed
  // from the saved record each time rather than stored anywhere.
  const savedPreliminaryByClassListId = useMemo(() => {
    const byStudent = new Map<number, PreliminaryScore>();
    if (!isDynamicTemplate || !evaluationReference) return byStudent;
    const manifests = new Map<string, V3AnswerSheetManifest | null>();
    students.forEach(student => {
      if (!student.operationStage || student.officialScore) return;
      const record = getV3DynamicObjectiveOutbox(test.test_assignment_id, student.classListId);
      if (!record) return;
      if (!manifests.has(record.answerSheetUuid)) {
        manifests.set(record.answerSheetUuid, getV3CachedAnswerSheetManifest(record.answerSheetUuid));
      }
      const score = preliminaryForSavedRecord(
        record,
        evaluationReference,
        manifests.get(record.answerSheetUuid) ?? null,
      );
      if (score) byStudent.set(student.classListId, score);
    });
    return byStudent;
  }, [students, evaluationReference, isDynamicTemplate, test.test_assignment_id]);

  const checkedCount = useMemo(
    () => students.filter(student => student.officialScore || student.operationStage).length,
    [students],
  );
  // Not yet officially scored by the backend - safe to (re)send. Each one syncs
  // independently under its own resultUuid, so a teacher can send however many
  // are ready now (e.g. 30 of 60) and send the rest later without anything
  // needing to be "complete" first.
  const pendingSyncStudents = useMemo(
    () => students.filter(student => student.operationStage && !student.officialScore),
    [students],
  );
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter(student => studentName(student).toLowerCase().includes(query));
  }, [students, searchQuery]);

  const eligibilityIssue = useMemo(() => {
    // Teacher-facing copy - no internal terms (manifest, template code,
    // endpoint paths). A teacher only needs to know what happened and what to
    // do about it, not how the app's data model represents it.
    if (!context) {
      return "This assessment doesn't have a printed answer sheet yet. Go to the "
        + 'web dashboard and generate the answer sheet for this assessment, then '
        + 'come back here to scan.';
    }
    if (context.templateCode !== FIXED_MC_TEMPLATE_CODE) {
      // Dynamic mixed-question-type template: no exact-10/MC-only requirement,
      // just the same minimum backend itself enforces at generation time.
      if (context.totalQuestions < DYNAMIC_MINIMUM_QUESTIONS) {
        return `This assessment needs at least ${DYNAMIC_MINIMUM_QUESTIONS} questions `
          + `before it can be scanned - it currently has ${context.totalQuestions}.`;
      }
      return null;
    }
    if (context.totalQuestions !== 10 || regions.length !== 10) {
      return "This answer sheet doesn't match what this assessment expects. Try "
        + 'regenerating the answer sheet from the web dashboard.';
    }
    return null;
  }, [context, regions.length]);

  const runScan = async (source: 'camera' | 'gallery') => {
    if (!selected || !context || eligibilityIssue) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (isDynamicTemplate) {
        const startedAt = Date.now();
        // The manifest saved at download time, so a scan can start offline.
        // A manifest never changes for a given answerSheetUuid (regenerating
        // makes a new uuid), so the saved copy can't be stale. Only an install
        // that never downloaded it goes to the network, and saves it for next time.
        let manifest = getV3CachedAnswerSheetManifest(context.answerSheetUuid);
        const manifestSource = manifest ? 'cache' : 'network';
        if (!manifest) {
          setMessage('Downloading the answer sheet for the first time...');
          const manifestEnvelope = await createV3MobileReadClient({
            baseUrl: V3_BASE_URL,
            getSessionToken: () => session.accessToken,
          }).getAnswerSheetManifest(test.assignment_uuid, context.answerSheetUuid);
          await saveV3AnswerSheetManifest(manifestEnvelope.data);
          manifest = manifestEnvelope.data;
        }
        const manifestReadyAt = Date.now();
        const manifestJson = buildDynamicScannerManifestJson(manifest);
        setDynamicManifest(manifest);
        setMessage(null);
        const options = {
          manifestJson,
          expectedAnswerSheetUuid: context.answerSheetUuid,
          expectedAssignmentUuid: test.assignment_uuid,
        };
        const nextDynamicScan = source === 'camera'
          ? await captureDynamicOmrSheet(options)
          : await chooseDynamicOmrImage(options);
        if (__DEV__) {
          // Temporary scan-speed diagnostic. The detector's own stage timings
          // don't cover its full-resolution pre-pass (page-edge detection,
          // warp, shadow removal) - that shows up only as detectorOtherMs.
          // nativeRoundTripMs also includes time spent in the camera app or
          // photo picker, so compare it against detectorTotalMs, not alone.
          const {qrDecodeMs, alignmentMs, analysisMs, totalMs} = nextDynamicScan.timings;
          console.log('[V3 Scan Timing]', JSON.stringify({
            source,
            pageNumber: nextDynamicScan.identity.pageNumber,
            manifestSource,
            manifestMs: manifestReadyAt - startedAt,
            nativeRoundTripMs: Date.now() - manifestReadyAt,
            detectorTotalMs: totalMs,
            detectorQrDecodeMs: qrDecodeMs,
            detectorAlignmentMs: alignmentMs,
            detectorAnalysisMs: analysisMs,
            detectorOtherMs: totalMs - qrDecodeMs - alignmentMs - analysisMs,
          }));
        }
        setDynamicPages(prev => {
          // A rescan of an already-captured page replaces that page's entry
          // rather than duplicating it; a genuinely new page is appended.
          const withoutThisPage = prev.filter(
            page => page.identity.pageNumber !== nextDynamicScan.identity.pageNumber,
          );
          return [...withoutThisPage, nextDynamicScan]
            .sort((a, b) => a.identity.pageNumber - b.identity.pageNumber);
        });
        setScan(null);
      } else {
        const options = {
          expectedTemplateVersion: context.templateCode,
          expectedItemCount: 10,
          expectedTestId: test.test_id,
        };
        const nextScan = source === 'camera'
          ? await captureOmrSheet(options)
          : await chooseOmrImage(options);
        setScan(nextScan);
        setDynamicPages([]);
        setDynamicManifest(null);
        setWrittenScores({});
      }
    } catch (scanError) {
      if ((scanError as {code?: unknown} | null)?.code === 'OMR_SCAN_CANCELLED') {
        setMessage('Scan cancelled.');
      } else {
        showError(
          scanError instanceof Error ? scanError.message : 'Unable to scan the answer sheet.',
          () => runScan(source),
        );
        setMessage(null);
      }
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Saves the teacher's accepted verification locally ONLY - no network call.
   * Uploading happens later, on demand, via "Retry Saved Upload" (below the
   * assessment list once a result is saved), never automatically during
   * scanning/checking.
   */
  const queueRecord = async (student: V3ObjectiveStudent, nextScan: OmrScanResult) => {
    if (!context) return;
    setIsBusy(true);
    setError(null);
    try {
      queueV3ObjectiveScan({
        testAssignmentId: test.test_assignment_id,
        testId: test.test_id,
        assignmentUuid: test.assignment_uuid,
      }, student, context, regions, nextScan);
      setMessage("Saved on this phone. Send it whenever you're ready.");
      setScan(null);
      refreshLocal();
      onChanged();
    } catch (queueError) {
      showError(
        queueError instanceof Error ? queueError.message : 'Unable to save the result on this phone.',
        () => queueRecord(student, nextScan),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const syncRecord = async (student: V3ObjectiveStudent, nextScan?: OmrScanResult) => {
    if (!context) return;
    setIsBusy(true);
    setError(null);
    setMessage('Preparing to send...');
    try {
      const record = nextScan
        ? queueV3ObjectiveScan({
            testAssignmentId: test.test_assignment_id,
            testId: test.test_id,
            assignmentUuid: test.assignment_uuid,
          }, student, context, regions, nextScan)
        : getV3ObjectiveOutbox(test.test_assignment_id, student.classListId);
      if (!record) throw new Error('No saved V3 operation is available for retry.');
      setMessage('Sending to the web...');
      const result = await syncV3ObjectiveResult(
        V3_BASE_URL,
        session.accessToken,
        record,
      );
      setMessage(
        `Sent. Official score: ${result.officialScore.totalScore}/${result.officialScore.maxScore} (${result.officialScore.percentage}%).`,
      );
      setScan(null);
      refreshLocal();
      onChanged();
    } catch (syncError) {
      if (syncError instanceof V3ObjectiveHttpError && syncError.status === 401) {
        onSessionInvalid();
        return;
      }
      showError(
        `${syncError instanceof Error ? syncError.message : 'Unable to send the result.'}\n`
          + 'It is still saved on this phone - nothing was lost.',
        () => syncRecord(student),
      );
      setMessage(null);
      refreshLocal();
      onChanged();
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Saves the teacher's accepted dynamic verification locally ONLY - no
   * network call. Uploading happens later, on demand, via "Retry Saved
   * Upload" (below the assessment list once a result is saved), never
   * automatically during scanning/checking.
   */
  const queueDynamicRecord = async (student: V3ObjectiveStudent) => {
    if (!context) return;
    setIsBusy(true);
    setError(null);
    try {
      if (!dynamicManifest || dynamicPages.length === 0) {
        throw new Error('No captured dynamic pages are available to save.');
      }
      const writtenRegions = getV3DynamicWrittenRegions(test.test_assignment_id);
      queueV3DynamicScan(
        {
          testAssignmentId: test.test_assignment_id,
          testId: test.test_id,
          assignmentUuid: test.assignment_uuid,
        },
        student,
        context.answerSheetUuid,
        regions,
        writtenRegions,
        dynamicManifest,
        dynamicPages,
        writtenScores,
      );
      setMessage("Saved on this phone. Send it whenever you're ready.");
      setDynamicPages([]);
      setDynamicManifest(null);
      setWrittenScores({});
      refreshLocal();
      onChanged();
    } catch (queueError) {
      showError(
        queueError instanceof Error ? queueError.message : 'Unable to save the result on this phone.',
        () => queueDynamicRecord(student),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const syncDynamicRecord = async (student: V3ObjectiveStudent) => {
    if (!context) return;
    setIsBusy(true);
    setError(null);
    setMessage('Preparing to send...');
    try {
      const existing = getV3DynamicObjectiveOutbox(test.test_assignment_id, student.classListId);
      let record: V3DynamicObjectiveOutboxRecord;
      if (existing) {
        record = existing;
      } else {
        if (!dynamicManifest || dynamicPages.length === 0) {
          throw new Error('No saved V3 dynamic operation is available for retry.');
        }
        const writtenRegions = getV3DynamicWrittenRegions(test.test_assignment_id);
        record = queueV3DynamicScan(
          {
            testAssignmentId: test.test_assignment_id,
            testId: test.test_id,
            assignmentUuid: test.assignment_uuid,
          },
          student,
          context.answerSheetUuid,
          regions,
          writtenRegions,
          dynamicManifest,
          dynamicPages,
          writtenScores,
        );
      }
      setMessage('Sending to the web...');
      const result = await syncV3DynamicObjectiveResult(
        V3_BASE_URL,
        session.accessToken,
        record,
      );
      setMessage(
        `Sent. Official score: ${result.officialScore.totalScore}/${result.officialScore.maxScore} (${result.officialScore.percentage}%).`,
      );
      setDynamicPages([]);
      setDynamicManifest(null);
      setWrittenScores({});
      refreshLocal();
      onChanged();
    } catch (syncError) {
      if (syncError instanceof V3ObjectiveHttpError && syncError.status === 401) {
        onSessionInvalid();
        return;
      }
      showError(
        `${syncError instanceof Error ? syncError.message : 'Unable to send the result.'}\n`
          + 'It is still saved on this phone - nothing was lost.',
        () => syncDynamicRecord(student),
      );
      setMessage(null);
      refreshLocal();
      onChanged();
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Lets the teacher throw away a saved result (wrong paper scanned/checked)
   * and start that student over. Only allowed before any part of it has been
   * uploaded - after that the server holds a partial copy, and deleting the
   * phone's copy would leave that orphaned instead of undoing it.
   */
  const discardQueuedResult = (student: V3ObjectiveStudent) => {
    const record = isDynamicTemplate
      ? getV3DynamicObjectiveOutbox(test.test_assignment_id, student.classListId)
      : null;
    const uploadStarted = record
      ? v3DynamicUploadStarted(record)
      : student.operationStage != null && student.operationStage !== 'queued';
    if (uploadStarted) {
      setError('This result has already started uploading, so it can no longer be discarded on the phone. Send it again to finish.');
      return;
    }
    dialog.confirm({
      title: 'Discard saved scan?',
      message: `This throws away ${studentName(student)}'s saved scan on this phone so you can rescan from the start. This cannot be undone.`,
      cancelLabel: 'Cancel',
      confirmLabel: 'Discard',
      destructive: true,
      onConfirm: () => {
        if (isDynamicTemplate) {
          deleteV3DynamicObjectiveOutbox(test.test_assignment_id, student.classListId);
        } else {
          deleteV3ObjectiveOutbox(test.test_assignment_id, student.classListId);
        }
        setScan(null);
        setDynamicPages([]);
        setDynamicManifest(null);
        setWrittenScores({});
        setMessage(null);
        setError(null);
        refreshLocal();
      },
    });
  };

  /**
   * Sends every not-yet-officially-scored queued student, one at a time, in
   * one tap. Each student already syncs under its own independent resultUuid,
   * so a partial batch (e.g. 30 of 60 students checked so far) is a normal,
   * supported outcome, not a failure - a student that fails here just stays
   * queued, exactly as if the teacher had retried it individually, and the
   * ones that succeeded are not rolled back or affected by it.
   */
  const syncAllQueued = async () => {
    const queue = pendingSyncStudents;
    // isBusy alone isn't enough: it's true only while one individual sync call
    // is in flight, and briefly flips back to false between loop iterations -
    // a second tap landing in that gap would start an overlapping run against
    // the same students. bulkSync being non-null covers the whole run, not
    // just each iteration.
    if (queue.length === 0 || isBusy || bulkSync !== null) return;
    setBulkSync({total: queue.length, completed: 0, failed: []});
    for (const student of queue) {
      if (isDynamicTemplate) {
        await syncDynamicRecord(student);
      } else {
        await syncRecord(student);
      }
      const outbox = isDynamicTemplate
        ? getV3DynamicObjectiveOutbox(test.test_assignment_id, student.classListId)
        : getV3ObjectiveOutbox(test.test_assignment_id, student.classListId);
      const succeeded = outbox?.officialScore != null;
      setBulkSync(previous => previous && ({
        total: previous.total,
        completed: previous.completed + 1,
        failed: succeeded
          ? previous.failed
          : [...previous.failed, {
              name: studentName(student),
              reason: outbox?.lastError ?? 'Unknown error.',
            }],
      }));
    }
    // The summary card lists every failure; don't also leave the last one as a pop-up.
    dismissError();
    setMessage(null);
  };

  const selectNextStudent = () => {
    if (!selected) return;
    const list = filteredStudents.length > 0 ? filteredStudents : students;
    const currentIndex = list.findIndex(item => item.classListId === selected.classListId);
    const next = list[currentIndex + 1];
    if (!next) return;
    setSelected(next);
    setScan(null);
    setDynamicPages([]);
    setDynamicManifest(null);
    setWrittenScores({});
    setError(null);
    setMessage(null);
  };
  const hasNextStudent = selected
    ? (filteredStudents.length > 0 ? filteredStudents : students)
        .findIndex(item => item.classListId === selected.classListId) <
      (filteredStudents.length > 0 ? filteredStudents : students).length - 1
    : false;

  const unacceptableCount = scan?.detections.filter(
    detection => detection.detectionStatus === 'multiple_marks' || detection.detectionStatus === 'uncertain',
  ).length ?? 0;

  // A captured-but-not-yet-saved scan is the ONLY thing that puts the teacher
  // into the Review & Verify screen - queueRecord/queueDynamicRecord already
  // clear this same state on success, so once saved this naturally flips back
  // to false and the review screen closes itself with no extra bookkeeping.
  const showReview = isDynamicTemplate ? dynamicPages.length > 0 : scan !== null;

  /**
   * Leaving Review & Verify (back button or "Next Student") before saving
   * would silently throw away a captured scan - confirm first. `afterDiscard`
   * runs after the teacher confirms, so this same handler can both close the
   * review screen (no-op afterDiscard) and jump to the next student in one
   * tap once confirmed.
   */
  const requestCloseReview = (afterDiscard?: () => void) => {
    dialog.confirm({
      title: 'Discard this scan?',
      message: 'This scan has not been saved yet. Leaving now discards it and you will need to rescan.',
      cancelLabel: 'Keep Reviewing',
      confirmLabel: 'Discard',
      destructive: true,
      onConfirm: () => {
        setScan(null);
        setDynamicPages([]);
        setDynamicManifest(null);
        setWrittenScores({});
        setError(null);
        setMessage(null);
        afterDiscard?.();
      },
    });
  };

  // The selected student's saved result that's still waiting for its official
  // score (dynamic template only - the fixed 10-MC template has nothing
  // editable, since detected marks can only be fixed by rescanning).
  const selectedRecord = useMemo(
    () => (selected && isDynamicTemplate && selected.operationStage && !selected.officialScore
      ? getV3DynamicObjectiveOutbox(test.test_assignment_id, selected.classListId)
      : null),
    [selected, isDynamicTemplate, test.test_assignment_id],
  );
  // Once any part has reached the server, the phone copy is locked: the
  // server holds its own copy, so editing or discarding here would leave the
  // two disagreeing (or leave a half-uploaded result orphaned on the server).
  const selectedUploadStarted = selected?.operationStage
    ? selectedRecord ? v3DynamicUploadStarted(selectedRecord) : selected.operationStage !== 'queued'
    : false;

  const openEditSavedResult = () => {
    if (!selectedRecord) return;
    setError(null);
    setMessage(null);
    setEditing({
      record: selectedRecord,
      scores: Object.fromEntries(
        selectedRecord.writtenAnswers.map(answer => [answer.itemNumber, answer.score]),
      ),
      dirty: false,
    });
  };
  const requestCloseEdit = () => {
    if (!editing?.dirty) {
      setEditing(null);
      return;
    }
    dialog.confirm({
      title: 'Discard your changes?',
      message: 'The saved result stays exactly as it was before you opened it.',
      cancelLabel: 'Keep Editing',
      confirmLabel: 'Discard Changes',
      destructive: true,
      onConfirm: () => setEditing(null),
    });
  };
  const saveEditedScores = async () => {
    if (!editing) return;
    setIsBusy(true);
    setError(null);
    try {
      updateV3DynamicWrittenScores(editing.record.resultUuid, editing.scores);
      setEditing(null);
      setMessage("Changes saved on this phone. Send it whenever you're ready.");
      refreshLocal();
      onChanged();
    } catch (editError) {
      showError(
        editError instanceof Error ? editError.message : 'Unable to save the changes.',
        () => saveEditedScores(),
      );
    } finally {
      setIsBusy(false);
    }
  };
  const editingManifest = useMemo(
    () => (editing ? getV3CachedAnswerSheetManifest(editing.record.answerSheetUuid) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing?.record.answerSheetUuid],
  );
  const editingQuestionTypes = useMemo(() => {
    const types = new Map<string, string>();
    editingManifest?.pages.forEach(page => page.regions.forEach(region => {
      types.set(region.regionUuid, region.questionType);
    }));
    return types;
  }, [editingManifest]);
  const editingPreliminary = editing
    ? preliminaryForSavedRecord(editing.record, evaluationReference, editingManifest, editing.scores)
    : null;
  const editingComplete = editing
    ? editing.record.writtenAnswers.every(answer => isWrittenScoreComplete(
        editing.scores[answer.itemNumber],
        rubricForQuestion(answer.questionUuid),
      ))
    : false;

  // Shown over the top of every screen here, so a notice or an error is seen
  // wherever the teacher has scrolled.
  const statusOverlay = (
    <View style={styles.statusOverlay} pointerEvents="box-none">
      <V3ServerWakingNotice style={styles.wakingNotice} />
      <V3StatusToast
        message={message}
        error={error}
        busy={isBusy}
        onRetry={retry && retry.error === error ? retry.run : null}
        onDismissMessage={dismissMessage}
        onDismissError={dismissError}
      />
    </View>
  );

  const studentStatus = (student: V3ObjectiveStudent): {text: string; color: string} => {
    if (student.officialScore) {
      return {
        text: `Official ${student.officialScore.totalScore}/${student.officialScore.maxScore}`,
        color: theme.colors.primary,
      };
    }
    if (student.operationStage) {
      const stage = student.operationStage.replaceAll('_', ' ');
      return {
        text: `Saved: ${stage.charAt(0).toUpperCase()}${stage.slice(1)}${preliminaryLabel(
          savedPreliminaryByClassListId.get(student.classListId),
        )}`,
        color: theme.status.saved.text,
      };
    }
    return {text: 'Not checked', color: theme.colors.muted};
  };

  const reviewSecondaryActions = (
    <FooterRow>
      {isDynamicTemplate ? (
        <Button
          label="Discard All and Rescan"
          icon={RefreshCw}
          variant="dangerOutline"
          style={styles.flexButton}
          onPress={() => {setDynamicPages([]); setDynamicManifest(null); setWrittenScores({});}}
          disabled={isBusy}
        />
      ) : null}
      {hasNextStudent ? (
        <Button
          label="Next Student ›"
          variant="secondary"
          style={styles.flexButton}
          onPress={() => requestCloseReview(selectNextStudent)}
          disabled={isBusy}
        />
      ) : null}
    </FooterRow>
  );
  const writtenRemaining = combinedWrittenEvidence.length - scoredWrittenCount;

  return (
    <>
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title={test.test_name || 'V3 Assessment'}
          // Two assignments can easily share a near-identical name under the
          // very same class - the assignment ID is the one thing that's always
          // unique, so it's shown here as the disambiguator.
          subtitle={(
            <>
              <Text style={styles.headerAssignment} numberOfLines={1}>
                {[classData.grade_level_name, classData.section_name].filter(Boolean).join(' - ')}
                {classData.grade_level_name || classData.section_name ? ' · ' : ''}
                Assignment #{test.test_assignment_id}
              </Text>
              <Text style={styles.headerSubtitle}>Scan, verify, and send official result</Text>
            </>
          )}
          onClose={onClose}
          closeLabel="Close assessment"
          navigationDisabled={isBusy}
          busy={isBusy}
        />

        <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {eligibilityIssue ? (
            <Banner tone="warning" title="Answer sheet not ready" style={styles.sectionSpacing}>
              <Text style={styles.bannerText}>{eligibilityIssue}</Text>
              {__DEV__ ? (
                <Text style={styles.bannerMeta}>Backend URL: {V3_BASE_URL}</Text>
              ) : null}
            </Banner>
          ) : null}

          {!eligibilityIssue && knownTotalPages !== null && knownTotalPages > 1 ? (
            <Banner
              tone="info"
              style={styles.sectionSpacing}
              message={`This assessment's answer sheet has ${knownTotalPages} pages. Scan every page, one at a time, for each student before sending their result.`}
            />
          ) : null}

          <ProgressBar
            current={checkedCount}
            total={students.length}
            label={`${checkedCount} of ${students.length} checked`}
            style={styles.sectionSpacing}
          />

          {bulkSync ? (
            <Card style={styles.sectionSpacing}>
              <View style={styles.bulkSyncHeader}>
                <Text style={styles.bulkSyncTitle}>
                  {bulkSync.completed < bulkSync.total
                    ? `Sending ${bulkSync.completed + 1} of ${bulkSync.total}...`
                    : `Sent ${bulkSync.total - bulkSync.failed.length}/${bulkSync.total} to the backend.`}
                </Text>
                {bulkSync.completed < bulkSync.total ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : null}
              </View>
              {bulkSync.failed.length > 0 ? (
                <>
                  <Text style={styles.bulkSyncFailedHeading}>
                    {bulkSync.failed.length} still need retrying:
                  </Text>
                  {bulkSync.failed.map(item => (
                    <Text key={item.name} style={styles.bulkSyncFailedRow}>
                      • {item.name} - {item.reason}
                    </Text>
                  ))}
                </>
              ) : null}
              {bulkSync.completed >= bulkSync.total ? (
                <Button
                  label="Dismiss"
                  variant="secondary"
                  onPress={() => setBulkSync(null)}
                  style={styles.bulkSyncDismiss}
                />
              ) : null}
            </Card>
          ) : pendingSyncStudents.length > 0 ? (
            <Button
              label={`Send All Saved Results (${pendingSyncStudents.length})`}
              icon={CloudUpload}
              onPress={syncAllQueued}
              disabled={isBusy}
              fullWidth
              style={styles.sectionSpacing}
            />
          ) : null}

          <Text style={styles.sectionTitle} accessibilityRole="header">Select test student</Text>

          <SearchField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search student name..."
            containerStyle={styles.sectionSpacing}
          />

          {filteredStudents.length === 0 && searchQuery.trim() ? (
            <EmptyState
              icon={Search}
              title={`No student matches "${searchQuery}"`}
              action={{label: 'Clear search', onPress: () => setSearchQuery('')}}
            />
          ) : null}

          {filteredStudents.map(student => {
            const status = studentStatus(student);
            return (
              <ListRow
                key={student.classListId}
                title={studentName(student)}
                subtitle={status.text}
                subtitleColor={status.color}
                selected={selected?.classListId === student.classListId}
                right={student.officialScore
                  ? <CircleCheck size={22} color={theme.colors.primary} strokeWidth={2.2} />
                  : null}
                onPress={() => {setSelected(student); setScan(null); setDynamicPages([]); setDynamicManifest(null); setWrittenScores({}); setError(null); setMessage(null);}}
                disabled={isBusy}
                style={styles.rowSpacing}
              />
            );
          })}

        </ScrollView>
        {statusOverlay}
        </View>

        {selected && selected.operationStage && !selected.officialScore ? (
          <StickyFooter
            hint={selectedUploadStarted
              ? 'Upload already started, so this result can no longer be changed on the phone. '
                + 'Send it again to finish.'
              : 'Saved on this phone. You can still change it until you send it.'}
          >
            <Button
              label="Send Saved Result to Backend"
              icon={CloudUpload}
              onPress={() => (isDynamicTemplate ? syncDynamicRecord(selected) : syncRecord(selected))}
              disabled={isBusy}
              fullWidth
            />
            {!selectedUploadStarted ? (
              <FooterRow>
                {selectedRecord && selectedRecord.writtenAnswers.length > 0 ? (
                  <Button
                    label="Edit Scores"
                    variant="secondary"
                    style={styles.flexButton}
                    onPress={openEditSavedResult}
                    disabled={isBusy}
                  />
                ) : null}
                <Button
                  label="Discard & Rescan"
                  icon={XCircle}
                  variant="dangerOutline"
                  style={styles.flexButton}
                  onPress={() => discardQueuedResult(selected)}
                  disabled={isBusy}
                />
              </FooterRow>
            ) : null}
          </StickyFooter>
        ) : null}

        {selected && !selected.operationStage && !eligibilityIssue && !showReview &&
          (!isDynamicTemplate || !isDynamicCaptureComplete) ? (
          <StickyFooter
            hint={isDynamicTemplate && knownTotalPages && knownTotalPages > 1
              ? `Scan page ${nextMissingPageNumber} of ${knownTotalPages}`
              : null}
          >
            <FooterRow>
              <Button label="Open Camera" icon={Camera} style={styles.flexButton} onPress={() => runScan('camera')} disabled={isBusy} />
              <Button label="Choose Photo" icon={ImageIcon} variant="secondary" style={styles.flexButton} onPress={() => runScan('gallery')} disabled={isBusy} />
            </FooterRow>
          </StickyFooter>
        ) : null}
      </SafeAreaView>
    </Modal>

    {/*
      Review & Verify - a separate full-screen step, not an inline extension of
      the student list below the fold. Opens automatically once there's a
      captured-but-unsaved scan (showReview), and closes itself automatically
      once that scan is saved (queueRecord/queueDynamicRecord clear the same
      state on success) - the only way to leave it BEFORE saving is the back
      button or "Next Student", both routed through requestCloseReview so an
      accidental exit can't silently throw away a scan.
    */}
    <Modal
      visible={showReview}
      animationType="slide"
      onRequestClose={() => requestCloseReview()}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Review & Verify"
          subtitle={selected ? studentName(selected) : ''}
          onBack={() => requestCloseReview()}
          backLabel="Back to student list"
          navigationDisabled={isBusy}
          right={<HeaderScore score={dynamicPages.length > 0 ? reviewPreliminary : null} />}
          busy={isBusy}
        />

        <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {scan ? (
            <View>
              <Text style={styles.sectionTitle} accessibilityRole="header">Teacher verification</Text>
              <Text style={styles.verificationHint}>
                Confirm these match what's shaded on the paper. A misread mark can only be fixed
                by rescanning. The score appears after you send the result.
              </Text>
              <Card padded={false} style={styles.sectionSpacing}>
                <Image
                  source={{uri: scan.annotatedImageUri}}
                  style={styles.preview}
                  resizeMode="contain"
                  accessibilityLabel="Scanned answer sheet"
                />
              </Card>
              <Card padded={false} style={styles.sectionSpacing}>
                {scan.detections.map((detection, index) => (
                  <View style={[styles.detectionRow, index > 0 && styles.rowDivider]} key={detection.itemNumber}>
                    <Text style={styles.itemNumber}>Q{detection.itemNumber}</Text>
                    <Text style={styles.detectedAnswer}>{detection.detectedOption || 'Blank'}</Text>
                    <Text style={styles.detectionStatus}>{detection.detectionStatus.replaceAll('_', ' ')}</Text>
                  </View>
                ))}
              </Card>
              {unacceptableCount > 0 ? (
                <Banner
                  tone="warning"
                  style={styles.sectionSpacing}
                  message={`${unacceptableCount} item(s) are uncertain or multiple-mark - recorded as-is and scored as zero, same as blank.`}
                />
              ) : null}
            </View>
          ) : null}

          {dynamicPages.length > 0 ? (
            <View>
              <PreliminaryScoreBanner score={reviewPreliminary} />
              <Text style={styles.sectionTitle} accessibilityRole="header">Scanned answer sheet</Text>
              <Text style={styles.helperText}>
                Not sent yet. After you tap "Accept and Save Result", it stays on this phone
                until you send it from the student list.
              </Text>

              {dynamicTotalPages !== null && dynamicTotalPages > 1 ? (
                <View style={styles.sectionSpacing}>
                  <Text style={styles.reviewSubheading}>
                    Pages captured: {dynamicPages.length}/{dynamicTotalPages}
                  </Text>
                  {!isDynamicCaptureComplete && nextMissingPageNumber !== null ? (
                    <Banner
                      tone="warning"
                      message={`Scan page ${nextMissingPageNumber} of ${dynamicTotalPages} to continue - the answer sheet is not complete yet.`}
                    />
                  ) : null}
                </View>
              ) : null}

              {dynamicPages.map(page => (
                <Card key={`page-${page.identity.pageNumber}`} padded={false} style={styles.sectionSpacing}>
                  <Text style={styles.pageLabel}>
                    Page {page.identity.pageNumber} of {page.identity.totalPages}
                  </Text>
                  <Image
                    source={{uri: page.annotatedImageUri}}
                    style={styles.preview}
                    resizeMode="contain"
                    accessibilityLabel={`Scanned page ${page.identity.pageNumber}`}
                  />
                </Card>
              ))}

              {combinedObjectiveDetections.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle} accessibilityRole="header">Objective answers (read-only)</Text>
                  <Text style={styles.verificationHint}>
                    Confirm these match what's shaded on the paper. A misread mark can only be
                    fixed by rescanning the page.
                  </Text>
                  <Card padded={false} style={styles.sectionSpacing}>
                    {combinedObjectiveDetections.map((detection, index) => {
                      const pillOptions = pillOptionsByRegion.get(detection.regionUuid)
                        ?? (detection.questionType === 'true_false'
                          ? FALLBACK_TRUE_FALSE_PILLS
                          : FALLBACK_MULTIPLE_CHOICE_PILLS);
                      // detectedLabel is the detected option's manifest key; compare on
                      // that, and show the label printed on paper (T/F for True/False).
                      const detected = detection.detectedLabel?.trim().toUpperCase() || null;
                      const isMultiple = detection.detectionStatus === 'multiple_marks';
                      return (
                        <View
                          style={[styles.objectiveReviewRow, index > 0 && styles.rowDivider]}
                          key={`objective-${detection.itemNumber}`}
                        >
                          <View style={styles.itemHeader}>
                            <Text style={styles.itemNumber}>Q{detection.itemNumber}</Text>
                            <Text style={styles.detectionStatus}>
                              {detection.detectionStatus.replaceAll('_', ' ')}
                            </Text>
                          </View>
                          <View style={styles.optionPillRow}>
                            {[
                              ...pillOptions,
                              {key: 'Blank', label: 'Blank'},
                              {key: 'Multiple', label: 'Multiple'},
                            ].map(({key, label}) => {
                              const isDetected = key === 'Multiple'
                                ? isMultiple
                                : key === 'Blank'
                                  ? !detected && !isMultiple
                                  : detected === key.toUpperCase();
                              const pillStyle = !isDetected
                                ? null
                                : key === 'Multiple'
                                  ? styles.optionPillMultiple
                                  : key === 'Blank'
                                    ? styles.optionPillBlank
                                    : styles.optionPillDetected;
                              const textStyle = !isDetected
                                ? null
                                : key === 'Multiple'
                                  ? styles.optionPillTextMultiple
                                  : key === 'Blank'
                                    ? styles.optionPillTextBlank
                                    : styles.optionPillTextDetected;
                              return (
                                <View
                                  key={key}
                                  style={[styles.optionPill, pillStyle]}
                                  accessibilityLabel={`${label}${isDetected ? ', detected' : ''}`}
                                >
                                  <Text style={[styles.optionPillText, textStyle]}>{label}</Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                </>
              ) : null}

              {combinedWrittenEvidence.length > 0 ? (
                <>
                  <View style={styles.itemHeader}>
                    <Text style={styles.sectionTitle} accessibilityRole="header">Written-response evidence</Text>
                    <Text style={styles.sectionProgress}>
                      {scoredWrittenCount}/{combinedWrittenEvidence.length} scored
                    </Text>
                  </View>
                  <Text style={styles.helperText}>
                    The points you enter here (Right/Wrong, partial points, or a rubric score) are
                    the student's score for each item, saved on the web exactly as entered.
                    Double-check each one before saving.
                  </Text>
                </>
              ) : null}
              {combinedWrittenEvidence.map(evidence => (
                <WrittenScoringCard
                  key={`written-${evidence.itemNumber}`}
                  itemNumber={evidence.itemNumber}
                  questionType={evidence.questionType}
                  imageUri={evidence.enhancedImageUri}
                  score={writtenScores[evidence.itemNumber]}
                  question={questionByUuid.get(evidence.questionUuid)}
                  rubric={rubricForQuestion(evidence.questionUuid)}
                  disabled={isBusy}
                  onChange={nextScore => setWrittenScores(
                    previous => ({...previous, [evidence.itemNumber]: nextScore}),
                  )}
                />
              ))}
            </View>
          ) : null}

        </ScrollView>
        {statusOverlay}
        </View>

        {scan ? (
          <StickyFooter>
            <Button
              label="Accept and Save Result"
              icon={CircleCheck}
              onPress={() => queueRecord(selected!, scan)}
              disabled={isBusy}
              fullWidth
            />
            {hasNextStudent ? reviewSecondaryActions : null}
          </StickyFooter>
        ) : null}

        {isDynamicTemplate && dynamicPages.length > 0 ? (
          isDynamicCaptureComplete ? (
            <StickyFooter
              hint={writtenRemaining > 0
                ? `Score every written-response item above before sending - ${writtenRemaining} remaining.`
                : null}
            >
              <Button
                label="Accept and Save Result"
                icon={CircleCheck}
                onPress={() => queueDynamicRecord(selected!)}
                disabled={isBusy || writtenRemaining > 0}
                fullWidth
              />
              {reviewSecondaryActions}
            </StickyFooter>
          ) : (
            <StickyFooter hint={`Scan page ${nextMissingPageNumber} of ${knownTotalPages}`}>
              <FooterRow>
                <Button label="Open Camera" icon={Camera} style={styles.flexButton} onPress={() => runScan('camera')} disabled={isBusy} />
                <Button label="Choose Photo" icon={ImageIcon} variant="secondary" style={styles.flexButton} onPress={() => runScan('gallery')} disabled={isBusy} />
              </FooterRow>
              {reviewSecondaryActions}
            </StickyFooter>
          )
        ) : null}
      </SafeAreaView>
    </Modal>

    {/*
      Edit Saved Scores - reopens a saved result that hasn't started uploading
      so the teacher can change its written-item points. Multiple Choice/True-
      False marks aren't editable here (only a rescan fixes a misread mark).
    */}
    <Modal
      visible={editing !== null}
      animationType="slide"
      onRequestClose={requestCloseEdit}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Edit Saved Scores"
          subtitle={selected ? studentName(selected) : ''}
          onBack={requestCloseEdit}
          backLabel="Back to student list"
          navigationDisabled={isBusy}
          right={<HeaderScore score={editingPreliminary} />}
          busy={isBusy}
        />

        <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PreliminaryScoreBanner score={editingPreliminary} />
          <Text style={styles.verificationHint}>
            Multiple Choice and True/False marks can't be changed here. If one was misread, go back
            and use Discard & Rescan.
          </Text>
          {editing?.record.writtenAnswers
            .slice()
            .sort((a, b) => a.itemNumber - b.itemNumber)
            .map(answer => (
              <WrittenScoringCard
                key={`edit-${answer.itemNumber}`}
                itemNumber={answer.itemNumber}
                questionType={editingQuestionTypes.get(answer.regionUuid) ?? 'written'}
                imageUri={answer.evidenceImageUri}
                score={editing.scores[answer.itemNumber]}
                question={questionByUuid.get(answer.questionUuid)}
                rubric={rubricForQuestion(answer.questionUuid)}
                disabled={isBusy}
                onChange={nextScore => setEditing(previous => previous && ({
                  ...previous,
                  scores: {...previous.scores, [answer.itemNumber]: nextScore},
                  dirty: true,
                }))}
              />
            ))}
        </ScrollView>
        {statusOverlay}
        </View>

        <StickyFooter hint={!editingComplete ? 'Score every written item before saving.' : null}>
          <Button
            label="Save Changes"
            icon={CircleCheck}
            onPress={saveEditedScores}
            disabled={isBusy || !editing?.dirty || !editingComplete}
            fullWidth
          />
        </StickyFooter>
      </SafeAreaView>
    </Modal>
    </>
  );
};

const {colors, status, spacing, radius, type} = theme;

const styles = StyleSheet.create({
  // White behind the status bar and gesture area; the gray page sits in `body`.
  safeArea: {flex: 1, backgroundColor: colors.surface},
  body: {flex: 1, backgroundColor: colors.bg},
  content: {padding: theme.screenPadding, paddingBottom: spacing.xxxl},
  statusOverlay: {position: 'absolute', top: 0, left: theme.screenPadding, right: theme.screenPadding},
  wakingNotice: {marginTop: spacing.sm},
  headerAssignment: {...type.label, color: colors.primary, marginTop: 2},
  headerSubtitle: {...type.caption, color: colors.muted},
  sectionSpacing: {marginBottom: spacing.md},
  rowSpacing: {marginBottom: spacing.sm},
  sectionTitle: {...type.cardTitle, color: colors.text, marginTop: spacing.xs, marginBottom: spacing.sm},
  sectionProgress: {...type.label, color: colors.primary},
  helperText: {...type.body, color: colors.muted, marginBottom: spacing.md},
  verificationHint: {...type.body, color: status.info.text, marginBottom: spacing.md},
  reviewSubheading: {...type.label, color: colors.muted, textTransform: 'uppercase', marginBottom: spacing.sm},
  bannerText: {...type.body, color: colors.textSecondary},
  bannerMeta: {...type.caption, color: colors.muted, marginTop: spacing.sm},
  bulkSyncHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md},
  bulkSyncTitle: {...type.bodyStrong, color: colors.text, flex: 1},
  bulkSyncFailedHeading: {...type.bodyStrong, color: status.danger.text, marginTop: spacing.md},
  bulkSyncFailedRow: {...type.caption, color: colors.textSecondary, marginTop: spacing.xs},
  bulkSyncDismiss: {marginTop: spacing.md, alignSelf: 'flex-start'},
  flexButton: {flexGrow: 1, flexBasis: 140},
  preliminaryHeader: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm},
  preliminaryLabel: {...type.bodyStrong, color: status.success.text},
  preliminaryValue: {...type.score, color: colors.primary},
  preliminaryHint: {...type.caption, color: colors.textSecondary, marginTop: spacing.xs},
  preview: {height: 300, backgroundColor: colors.imageBackdrop},
  pageLabel: {...type.label, color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm},
  itemHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm},
  itemNumber: {...type.bodyStrong, color: colors.text, minWidth: 40},
  itemMeta: {...type.label, color: colors.textSecondary, textTransform: 'capitalize', flexShrink: 1, textAlign: 'right'},
  detectionRow: {minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg},
  rowDivider: {borderTopWidth: 1, borderTopColor: colors.border},
  detectedAnswer: {...type.cardTitle, color: colors.primary, width: 72},
  detectionStatus: {...type.caption, color: colors.muted, flex: 1, textTransform: 'capitalize', textAlign: 'right'},
  objectiveReviewRow: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md},
  optionPillRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  optionPill: {
    minWidth: theme.touchTarget,
    minHeight: theme.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionPillDetected: {backgroundColor: colors.primary, borderColor: colors.primary},
  optionPillBlank: {backgroundColor: status.warning.bg, borderColor: status.warning.border},
  optionPillMultiple: {backgroundColor: status.danger.bg, borderColor: status.danger.border},
  optionPillText: {...type.bodyStrong, color: colors.textSecondary},
  optionPillTextDetected: {color: colors.onPrimary},
  optionPillTextBlank: {color: status.warning.text},
  optionPillTextMultiple: {color: status.danger.text},
  writtenEvidenceImage: {height: 140, backgroundColor: colors.surfaceSunken, borderRadius: radius.control, marginBottom: spacing.md},
  acceptedAnswersBox: {backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, padding: spacing.md, marginBottom: spacing.md},
  acceptedAnswersLabel: {...type.label, color: colors.muted, textTransform: 'uppercase', marginBottom: spacing.xs},
  acceptedAnswerText: {...type.bodyStrong, color: colors.text, marginTop: 2},
  scoreButtonRow: {flexDirection: 'row', gap: spacing.sm},
  scoreButton: {flex: 1},
  scoreButtonWrongActive: {backgroundColor: status.danger.bg},
  partialPointsRow: {marginTop: spacing.md},
  partialPointsLabel: {...type.label, color: colors.textSecondary, marginBottom: spacing.xs},
  rubricList: {borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm},
  rubricTitle: {...type.bodyStrong, color: colors.text, flex: 1},
  rubricTotal: {...type.bodyStrong, color: colors.primary},
  criterionRow: {paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  criterionName: {...type.bodyStrong, color: colors.textSecondary},
  criterionDescription: {...type.caption, color: colors.muted, marginTop: 2},
  criterionStepperRow: {minHeight: theme.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs},
  stepperButton: {borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.control},
  criterionScoreInput: {
    width: 64,
    minHeight: theme.touchTarget,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: type.cardTitle.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  criterionMaxText: {...type.caption, color: colors.muted},
  inputDisabled: {backgroundColor: colors.surfaceSunken, color: colors.muted},
});
