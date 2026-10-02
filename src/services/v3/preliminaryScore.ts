import type {
  V3AnswerSheetManifest,
  V3ManifestOptionCoordinate,
} from '../../database/v3/contracts';
import type {V3DynamicWrittenScore} from '../../database/v3/dynamicObjectiveRepository';
import type {V3EvaluationReference} from './dynamicVerificationClient';

/**
 * Display-only score shown on the phone right after a sheet is scanned. It is
 * never uploaded or stored - the server computes the official score from the
 * uploaded detections and the teacher's written scores, and that replaces
 * this as soon as it comes back.
 */
export interface PreliminaryScore {
  earned: number;
  maximum: number;
  /**
   * Questions whose points can't be known yet: no answer key downloaded, a
   * written item the teacher hasn't scored, or a page not scanned yet.
   */
  pendingCount: number;
}

export interface PreliminaryObjectiveInput {
  regionUuid: string;
  questionUuid: string;
  detectionStatus: string;
  /** The printed option key the scanner detected (manifest region.options[].key). */
  detectedLabel: string | null;
}

export interface PreliminaryWrittenInput {
  questionUuid: string;
  score: V3DynamicWrittenScore | undefined;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const optionsByRegion = (
  manifest: V3AnswerSheetManifest | null,
): Map<string, V3ManifestOptionCoordinate[]> => {
  const lookup = new Map<string, V3ManifestOptionCoordinate[]>();
  manifest?.pages.forEach(page =>
    page.regions.forEach(region => lookup.set(region.regionUuid, region.options)),
  );
  return lookup;
};

/**
 * Whether the detected option (its manifest key) is the correct one. The
 * answer key names the correct option, but manifests haven't been consistent
 * about which option field that matches: real backend sheets store True/False
 * as key "A"/"B" with value "True"/"False", while older sample sheets used
 * key "T"/"F" with value "A"/"B". So resolve the correct option by key first,
 * then by stored value, and compare keys.
 */
const isCorrectMark = (
  options: V3ManifestOptionCoordinate[] | undefined,
  detectedLabel: string,
  correctOptionKey: string,
): boolean => {
  const correctOption = options?.find(option => option.key === correctOptionKey)
    ?? options?.find(option => option.storedValue === correctOptionKey);
  return correctOption ? correctOption.key === detectedLabel : detectedLabel === correctOptionKey;
};

const writtenPoints = (
  score: V3DynamicWrittenScore | undefined,
  maximumPoints: number,
  rubricCriterionCount: number | null,
): number | null => {
  if (!score) return null;
  if (score.mode === 'manual') return score.decision === 'correct' ? maximumPoints : 0;
  if (score.mode === 'points') return score.points;
  if (rubricCriterionCount == null || score.criterionScores.length < rubricCriterionCount) {
    return null;
  }
  return score.criterionScores.reduce((total, entry) => total + entry.pointsAwarded, 0);
};

export const computePreliminaryScore = ({
  reference,
  manifest,
  objective,
  written,
}: {
  reference: V3EvaluationReference | null;
  manifest: V3AnswerSheetManifest | null;
  objective: PreliminaryObjectiveInput[];
  written: PreliminaryWrittenInput[];
}): PreliminaryScore | null => {
  if (!reference) return null;
  const regionOptions = optionsByRegion(manifest);
  const objectiveByQuestion = new Map(objective.map(entry => [entry.questionUuid, entry]));
  const writtenByQuestion = new Map(written.map(entry => [entry.questionUuid, entry]));
  const criterionCountByRubric = new Map(
    reference.rubrics.map(rubric => [rubric.rubricId, rubric.criteria.length]),
  );

  let earned = 0;
  let maximum = 0;
  let pendingCount = 0;
  reference.questions.forEach(question => {
    maximum += question.maximumPoints;

    const detection = objectiveByQuestion.get(question.questionUuid);
    if (detection) {
      if (question.correctOptionKey == null) {
        pendingCount += 1;
        return;
      }
      // Blank, multiple, and uncertain marks score zero, same as the server.
      if (detection.detectionStatus !== 'detected' || !detection.detectedLabel) return;
      if (isCorrectMark(
        regionOptions.get(detection.regionUuid),
        detection.detectedLabel,
        question.correctOptionKey,
      )) {
        earned += question.maximumPoints;
      }
      return;
    }

    const writtenEntry = writtenByQuestion.get(question.questionUuid);
    const points = writtenEntry
      ? writtenPoints(
          writtenEntry.score,
          question.maximumPoints,
          question.rubricId == null ? null : criterionCountByRubric.get(question.rubricId) ?? null,
        )
      : null;
    if (points == null) {
      pendingCount += 1;
      return;
    }
    earned += points;
  });

  return {earned: round2(earned), maximum: round2(maximum), pendingCount};
};
