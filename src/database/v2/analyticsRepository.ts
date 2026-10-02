import {getV2Database, rowsToArray} from './database';

interface ItemAnalyticsRow {
  question_id: number;
  part_order: number;
  item_number: number;
  correct_count: number;
  checked_count: number;
}

interface CompetencyAnalyticsRow {
  competency_id: number;
  competency_name: string;
  correct_count: number;
  response_count: number;
}

export interface V2AssessmentAnalytics {
  competencyPerformance: Array<{
    competencyId: number;
    competencyName: string;
    label: string;
    percent: number;
    correctCount: number;
    checkedCount: number;
  }>;
  itemAnalysis: Array<{
    questionId: number;
    itemNumber: number;
    label: string;
    percent: number;
    correctCount: number;
    checkedCount: number;
  }>;
}

const percentOf = (correct: number, total: number): number =>
  total > 0 ? Math.round((correct / total) * 100) : 0;

export const getV2AssessmentAnalytics = (
  testId: number,
  classId: number,
): V2AssessmentAnalytics => {
  const database = getV2Database();
  const itemRows = rowsToArray<ItemAnalyticsRow>(database.execute(
    `SELECT
       q.question_id,
       tp.part_order,
       q.item_number,
       SUM(CASE WHEN sa.provisional_is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
       COUNT(DISTINCT tr.test_result_id) AS checked_count
     FROM questions q
     INNER JOIN test_parts tp ON tp.test_part_id = q.test_part_id
     INNER JOIN tests t ON t.test_id = tp.test_id
     INNER JOIN class_assignments ca ON ca.class_assignment_id = t.class_assignment_id
     LEFT JOIN test_results tr
       ON tr.test_id = t.test_id
      AND tr.result_status = 'verified'
     LEFT JOIN student_answers sa
       ON sa.test_result_id = tr.test_result_id
      AND sa.question_id = q.question_id
     WHERE t.test_id = ?
       AND ca.class_id = ?
     GROUP BY q.question_id, tp.part_order, q.item_number
     ORDER BY tp.part_order, q.item_number, q.question_id`,
    [testId, classId],
  ));

  const competencyRows = rowsToArray<CompetencyAnalyticsRow>(database.execute(
    `SELECT
       s.competency_id,
       s.competency_name,
       SUM(CASE WHEN sa.provisional_is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
       COUNT(sa.student_answer_id) AS response_count
     FROM skills s
     INNER JOIN question_mappings qm ON qm.skill_id = s.skill_id
     INNER JOIN questions q ON q.question_id = qm.question_id
     INNER JOIN test_parts tp ON tp.test_part_id = q.test_part_id
     INNER JOIN tests t ON t.test_id = tp.test_id
     INNER JOIN class_assignments ca ON ca.class_assignment_id = t.class_assignment_id
     LEFT JOIN test_results tr
       ON tr.test_id = t.test_id
      AND tr.result_status = 'verified'
     LEFT JOIN student_answers sa
       ON sa.test_result_id = tr.test_result_id
      AND sa.question_id = q.question_id
     WHERE t.test_id = ?
       AND ca.class_id = ?
     GROUP BY s.competency_id, s.competency_name
     ORDER BY s.competency_name, s.competency_id`,
    [testId, classId],
  ));

  let globalItemNumber = 0;
  return {
    itemAnalysis: itemRows.map(row => {
      globalItemNumber += 1;
      const correctCount = Number(row.correct_count ?? 0);
      const checkedCount = Number(row.checked_count ?? 0);
      return {
        questionId: row.question_id,
        itemNumber: globalItemNumber,
        label: `Item ${globalItemNumber}`,
        percent: percentOf(correctCount, checkedCount),
        correctCount,
        checkedCount,
      };
    }),
    competencyPerformance: competencyRows.map(row => {
      const correctCount = Number(row.correct_count ?? 0);
      const checkedCount = Number(row.response_count ?? 0);
      return {
        competencyId: row.competency_id,
        competencyName: row.competency_name,
        label: row.competency_name,
        percent: percentOf(correctCount, checkedCount),
        correctCount,
        checkedCount,
      };
    }),
  };
};
