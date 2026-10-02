# Mobile Testing and Debugging Documentation

Document snapshot: August 22, 2026

## 1. Verification Levels

This document uses four evidence levels:

- Source-confirmed: behavior is present in the current source.
- Previously manually confirmed: dated project documentation records a
  successful manual flow.
- Prototype-validated: tested only in the isolated Python/OpenCV project.
- Needs current confirmation: not re-tested against the latest running
  backend/device during this documentation task.

No runtime test was executed while preparing this documentation package.

## 2. Features Already Tested or Confirmed

| Feature | Evidence level | Result | Evidence |
| --- | --- | --- | --- |
| Teacher login | Previously manually confirmed and source-confirmed | Working in documented V1 flow | LoginScreen.tsx, authService.ts, MOBILE_APP_DOCUMENTATION.md |
| Download assigned classes, students, tests, test parts, and competencies | Previously manually confirmed and source-confirmed | Working in documented V1 flow | db.js and MOBILE_APP_DOCUMENTATION.md |
| Class, assessment, and student selection | Previously manually confirmed and source-confirmed | Working | App.tsx, NavigationLists.tsx, StudentList.tsx |
| Default-correct touch checking | Previously manually confirmed and source-confirmed | Working | CheckingGrid.tsx and June worklog |
| Offline SQLite save | Previously manually confirmed and source-confirmed | Working | CheckingGrid.tsx, schema.js, db.js |
| Weighted score computation | Source-confirmed after fix | Code sums points_per_item for score and maximum | CheckingGrid.tsx and db.js |
| Selected-test manual upload | Previously manually confirmed and source-confirmed | Working in documented V1 flow | syncService.ts and MOBILE_APP_DOCUMENTATION.md |
| Partial checking/upload | Previously manually confirmed | Teacher may upload checked students and continue later | MOBILE_APP_DOCUMENTATION.md |
| Restore after local reset | Previously manually confirmed and source-confirmed | Download path restores synced results and items | db.js and MOBILE_APP_DOCUMENTATION.md |
| Preliminary local analytics | Source-confirmed | Competency, item counts, sync counts, and student scores are present | AnalyticsView.tsx and db.js |
| Android release APK build | Confirmed on August 1, 2026 | Release APK was produced at that time | mobile-worklog-august-01-2026.md |
| Physical MC OMR clean sheet | Prototype-validated | 10/10 exact answers | OMR physical report dated August 10 |
| Physical MC OMR edge cases | Prototype-validated | Double mark flagged; unclear blanks withheld | OMR physical report dated August 10 |

## 3. Bugs Encountered and Fixes

### Student Search Results Were Hidden

- Period: June 16, 2026.
- Problem: compact student search results were not reliably visible/selectable.
- Fix: dropdown visibility and selection behavior were revised.
- Status: Completed in the documented UI revision.
- Evidence: mobile-ui-worklog-june-15-16-2026.md.

### Weighted Score Denominator Was Incorrect

- Period: Before/August 1, 2026.
- Problem: a weighted result could display 25/20 because total points were
  compared with item count rather than weighted maximum score.
- Fix: current score and maximum score sum points_per_item; maxScore is included
  in the upload payload.
- Status: Completed in source; backend/web use of maxScore needs current
  end-to-end confirmation.
- Evidence: CheckingGrid.tsx, db.js, syncService.ts, August 1 worklog.

### Sync Time Did Not Represent Actual Upload Time

- Period: August 1, 2026.
- Problem: backend/web could display a test-related time instead of the actual
  mobile upload time.
- Fix: uploadedAt is generated at upload using ISO format with local offset.
- Status: Completed mobile-side; backend persistence/display needs current
  confirmation.
- Evidence: syncService.ts and August 1 worklog.

### Test-Part Item Mapping Risk

- Period: August 1, 2026.
- Problem: repeated item numbers across test parts could be shifted or grouped
  incorrectly if itemNumber was treated as globally unique.
- Fix: mobile payload preserves testPartId plus part-local itemNumber.
- Status: Completed mobile-side; frontend/backend grouping needs current
  confirmation.
- Evidence: syncService.ts and message-to-frontend-ai-sync-payload.md.

### Duplicate test_parts SQLite Constraint Error

- Period: Early August 2026.
- Problem observed: UNIQUE constraint failed for test_parts.test_part_id during
  local initialization/download testing.
- Current mitigation in source: downloaded reference tables use replacement or
  upsert-oriented storage and stable backend IDs.
- Status: Needs current regression confirmation. The available documentation
  does not contain a dedicated final test record for this exact error.

### Android Emulator Native SQLite Loading and Missing-Table Errors

- Period: Early August 2026.
- Problems observed:
  - react-native-quick-sqlite native loader compatibility error on an Android
    15 emulator;
  - app returning to the home screen during startup;
  - no such table errors for classes and test_results when initialization did
    not complete.
- Work performed: a compatible API 34 emulator was prepared, Android/Metro
  builds were cleaned and rerun, and initDatabase remains responsible for
  creating all V1 tables.
- Status: Needs current confirmation across the latest emulator and physical
  APK. No automated regression test covers native startup/database creation.

### Backend Connection Passed but Download Returned HTTP 500

- Period: Early August 2026.
- Problem: a backend connection/authentication request returned HTTP 200 while
  the download-sync endpoint returned HTTP 500.
- Interpretation: network/backend reachability alone did not prove sync
  endpoint success.
- Later status: project documentation records V1 download as working, but the
  latest deployed endpoint was not re-tested during this documentation task.
- Status: Needs current cloud regression.

### OMR QR Detection Failed on a Physical Photo

- Date: August 10, 2026.
- Problem: the small QR could not initially be decoded from the full camera
  image.
- Fix: enlarged top-right color and grayscale QR decode fallbacks were added in
  the isolated detector.
- Status: Prototype fix validated.
- Evidence: OMR_PHYSICAL_TEST_REPORT_2026-08-10.md.

### OMR Page Alignment Used the Wrong Boundary

- Date: August 10, 2026.
- Problem: the detector initially treated the camera frame/page boundary
  incorrectly instead of the four printed markers.
- Fix: direct four-marker perspective alignment was used.
- Status: Prototype fix validated.
- Evidence: OMR physical report and preserved output folders.

### OMR Blank Versus Uncertain Classification

- Date: August 10, 2026.
- Problem: dark background conditions caused intended blank items to be
  conservatively classified as uncertain.
- Safety behavior: no answer was finalized; items were routed to teacher
  verification.
- Status: Safe prototype behavior confirmed, threshold tuning still In Progress.

## 4. Features Confirmed Working in the Historical V1 Flow

The June/July/August documentation records this manual sequence as working:

Create assessment on web
-> download to mobile
-> select class/test/student
-> check students offline
-> upload current test
-> web shows results/analytics
-> clear local mobile data
-> download again
-> restore uploaded results

This is historical manual-test evidence. The same full sequence should be
repeated against the latest deployed backend before final defense.

## 5. Features That Still Have Problems or Gaps

- No comprehensive automated mobile test suite exists. The only Jest file is
  the generated App render smoke test.
- Current runtime compatibility with every target Android device is unverified.
- Latest cloud download/upload/restore behavior needs a fresh regression test.
- Backend/web handling of uploadedAt and maxScore needs confirmation.
- Current V1 item responses store correctness, not authoritative selected
  answers by V2 questionId.
- Partial Android-native MC OMR source is integrated into React Native, but a
  fresh phone build, scan, review, and isolated-save regression is pending.
- Phone-side True or False OMR is not implemented by the current detector.
- Blank/uncertain thresholds need a larger labeled physical image set.
- V2 SQLite source exists, but V2 download/upload, backend scoring, and
  end-to-end analytics are pending.
- Camera-image privacy, retention, and deletion rules remain unapproved.

## 6. Recommended Regression Checklist

1. Launch on the target emulator and at least one physical Android phone.
2. Confirm SQLite creates all current V1 tables on a clean install.
3. Login against the selected local/cloud backend.
4. Download assigned data twice and confirm no duplicate or constraint errors.
5. Check a weighted multi-part assessment and verify score/maxScore.
6. Stop halfway through a roster, upload, continue checking, and upload again.
7. Edit an already uploaded result and verify backend upsert behavior.
8. Clear local data, download again, and verify restore.
9. Confirm web grouping uses testPartId plus itemNumber.
10. Keep OMR tests isolated until V2 database/API contracts are approved.

## 7. August 18 Phone OMR Source Review

Source inspection confirms that the mobile project now contains Android-native
OpenCV detection, camera/gallery capture, a teacher-review modal, and isolated
V2 result persistence. This corrects the August 17 statement that no React
Native camera/verification source existed.

Evidence level: Source-confirmed only.

No fresh Android build, camera capture, detector accuracy run, or isolated V2
save was executed during the August 22 documentation audit. The phone scanner
must therefore remain Needs current confirmation.

## 8. August 22 Connectivity Audit

- V1 download and upload calls remain wired in the current application.
- No `/api/v2/sync/download` or `/api/v2/sync/upload` network call was found.
- `saveV2DownloadPayload()` has no application/service caller.
- The isolated V2 schema and DTOs are structurally aligned with the backend
  contract, but end-to-end compatibility is not runtime-confirmed.
- Current native phone scanning is limited to the ten-item Multiple Choice
  template; phone-side True or False scanning is not implemented.
