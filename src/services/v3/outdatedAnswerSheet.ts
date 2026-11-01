/**
 * ASM-7: a teacher may edit an ACTIVE assessment before anything is scanned.
 * The backend then deletes the old answer-sheet versions, so a copy printed
 * before the edit no longer exists on the server (SCAN_CONTEXT_NOT_FOUND).
 */
export const OUTDATED_ANSWER_SHEET_MESSAGE =
  'This answer sheet is outdated. Download again and print the latest sheet.';

export const isOutdatedAnswerSheetError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const {code, status} = error as {code?: unknown; status?: unknown};
  return code === 'SCAN_CONTEXT_NOT_FOUND' || (code == null && status === 404);
};
