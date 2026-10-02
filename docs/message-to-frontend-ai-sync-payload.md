# Message to Frontend AI

Date: August 1, 2026

Mobile-side verification for sync/result payload is complete.

Context checked:
- Assessment: Math Test 1
- Class: Grade 7 - Mabini
- Student focus: Miguel Cruz
- Mobile displays students as `LASTNAME, FIRSTNAME`, example `CRUZ, MIGUEL`. Keep this format on web.

Mobile findings:
- Mobile score calculation uses weighted points from `test_parts.points_per_item`.
- Mobile item mapping uses actual `testPartId` plus per-part `itemNumber`.
- Mobile does not shift Part 1 and Part 2 into global item numbers during upload.
- Mobile `rawAnswers` format is `testPartId:itemNumber=T/F`, preserving test part and item number.

Mobile payload update:
- Upload payload now includes `uploadedAt` in ISO local-offset format, example `2026-07-31T17:08:00+08:00`.
- Each uploaded `testResult` now includes `maxScore`.
- Each uploaded `testResult` now includes `checkedAt` from local result update time.
- Each uploaded item response now includes `updatedAt`.

Frontend guidance:
- For sync time shown on web, prefer backend/upload timestamp derived from mobile `uploadedAt` if backend stores it, not assessment/test creation date.
- For student score display, use `totalScore / maxScore` when `maxScore` is available.
- For item analysis and part scoring, group by `testPartId` and `itemNumber`, not by global item index alone.
- Do not assume Part 2 item 1 is global item 6 or similar unless the backend explicitly computes that view for display.

