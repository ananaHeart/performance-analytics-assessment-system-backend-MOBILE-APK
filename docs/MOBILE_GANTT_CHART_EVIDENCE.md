# Mobile Gantt Chart Evidence

Purpose:
- This file records the exact dates currently evidenced inside the mobile repository so the team can build a Gantt chart with traceable sources.

Scope:
- Repo: `D:\ThesisProjects\MobileAssessmentApp`
- Evidence basis used here:
  - document filenames
  - document content
  - filesystem creation dates
  - filesystem last modified dates

Important note:
- This repository did not show an existing Gantt chart document at the time of review on July 31, 2026; this evidence file was updated again on August 1, 2026.
- `git log -- docs` returned no dated document history in this checkout, so the exact dates below are based on the local repository files and their timestamps.

## Confirmed Documentation Timeline

| Date | Artifact | Event | Evidence |
| --- | --- | --- | --- |
| May 27, 2026 | `docs/MOBILE_APP_DOCUMENTATION.md` | Baseline mobile documentation file exists by this date | Filesystem creation date: May 27, 2026 |
| June 15, 2026 | `docs/mobile-ui-worklog-june-15-16-2026.md` | Mobile checking screen worklog begins | Document title and section heading: `June 15, 2026 - Mobile Checking Screen Focus` |
| June 16, 2026 | `docs/mobile-ui-worklog-june-15-16-2026.md` | Mobile UI continuation and analytics mockup documented | Document title and section heading: `June 16, 2026 - Mobile UI Continuation and Analytics Mockup` |
| June 16, 2026 | `docs/mobile-ui-worklog-june-15-16-2026.md` | Worklog file created and last updated in this repo snapshot | Filesystem creation date and last modified date: June 16, 2026 |
| July 31, 2026 | `docs/MOBILE_APP_DOCUMENTATION.md` | Mobile architecture and synchronization documentation expanded | Filesystem last modified date: July 31, 2026 |
| July 30, 2026 | Backend/cloud deployment note | Spring Boot backend was redeployed to cloud and tested with frontend plus cloud database | User-reported deployment/testing date during mobile cloud-preparation review |
| July 31, 2026 | `C:\Users\ADMIN\Downloads\performance_assessment_db (1).sql` | Current working backend database export reviewed for mobile SQLite alignment | Export file last modified: July 31, 2026 |
| July 31, 2026 | `src/database/schema.js`, `src/database/db.js` | Mobile SQLite database compatibility update for current backend database schema | Added local `tests.grading_period_id`; mapped `gradingPeriodId` / `grading_period_id`; removed automatic local demo assessment creation from normal DB init |
| July 31, 2026 | `SyncServiceImpl.java`, `SyncRepository.java` | Backend sync upload consistency update | Re-syncing edited mobile results now updates existing `test_result` and `test_item_result` records instead of skipping them |
| August 1, 2026 | `src/config/api.ts` | Mobile app configured for deployed cloud backend | API base URL set to `https://performance-analytics-assessment-system.onrender.com` for app-build preparation |
| August 1, 2026 | Android release APK | Mobile app release build prepared for testing | Release APK output path: `android/app/build/outputs/apk/release/app-release.apk` |
| August 1, 2026 | `src/components/AnalyticsView.tsx` | Mobile item analysis display updated | Changed teacher-facing item analysis from percentage-only success rate to correct-student counts such as `5/8` |
| August 1, 2026 | `src/database/syncService.ts` | Mobile sync payload verification and update | Added `uploadedAt`, per-result `maxScore`, per-result `checkedAt`, and per-item `updatedAt`; preserved `testPartId` plus per-part `itemNumber` mapping |
| August 1, 2026 | `docs/message-to-frontend-ai-sync-payload.md` | Frontend handoff note created | Explained mobile payload fields, raw answer format, weighted score handling, and part/item grouping requirements |
| August 9, 2026 | `docs/mobile-omr-prototype-test-2026-08-09.md` | First fixed-template offline OMR prototype test completed | Printed 10-item sheet, photographed page alignment, mapped bubble detection, multiple-mark handling, and teacher-verification requirement documented |
| August 9, 2026 | `docs/mobile-omr-prototype-specification-2026-08-09.md` | Isolated OMR scanner contract and QR templates documented | A4 dimensions, MC/T/F versions, test/student QR identity, thresholds, scanner output, uncertainty rules, teacher correction, and encountered errors recorded without production database changes |
| August 10, 2026 | `D:\ThesisProjects\OMRPrototype\OMR_PHYSICAL_TEST_REPORT_2026-08-10.md` | QR-enabled physical Multiple Choice OMR validation completed | Clean sheet achieved 10/10 exact answers; blank and multiple marks were withheld for teacher verification; QR crop fallback and original four-marker alignment were validated |

## Confirmed Knowledge Added on July 31, 2026

The July 31, 2026 documentation update added or confirmed these topics:

- React Native runtime notes
- Hermes JavaScript engine
- JSI as the JavaScript-to-native interop layer in the New Architecture
- Fabric as the rendering system
- render phase and shadow thread explanation
- TurboModules and Codegen clarification
- offline-first confirmation that the app is also offline-writable
- pull-based and push-based synchronization
- conflict behavior clarification that the app does not use true last-write-wins
- current backend database export comparison
- SQLite schema alignment for `test.grading_period_id`
- confirmation that deeper analytics tables are not required locally for the current mobile checking/sync flow
- removal of automatic local demo assessment creation during normal mobile database initialization
- backend upload consistency fix for edited mobile records

## Suggested Gantt Chart Rows

If you want to turn this into a formal Gantt chart, these are the clean task rows:

1. Mobile documentation baseline
   - Date: May 27, 2026

2. Mobile checking UI study and worklog
   - Start: June 15, 2026
   - End: June 16, 2026

3. Mobile analytics/mockup planning documentation
   - Date: June 16, 2026

4. Mobile architecture and sync documentation update
   - Date: July 31, 2026

5. Backend cloud redeployment and frontend/cloud database test
   - Date: July 30, 2026
   - Evidence type: user-reported project milestone

6. Mobile SQLite schema comparison against current backend database export
   - Date: July 31, 2026
   - Evidence file: `C:\Users\ADMIN\Downloads\performance_assessment_db (1).sql`

7. Mobile database compatibility update for cloud-backed sync
   - Date: July 31, 2026
   - Evidence files: `src/database/schema.js`, `src/database/db.js`
   - Work summary: added `tests.grading_period_id`, mapped backend grading-period field if present, removed normal-startup fake assessment/test-part creation

8. Backend sync update/upsert consistency fix
   - Date: July 31, 2026
   - Evidence files: `SyncServiceImpl.java`, `SyncRepository.java`
   - Work summary: existing checked results and item responses are updated on repeat mobile sync

9. Mobile cloud-backend app build preparation
   - Date: August 1, 2026
   - Evidence files: `src/config/api.ts`, Android Gradle release output
   - Work summary: mobile app was prepared to use the deployed backend instead of local/USB/localhost during app testing

10. Mobile analytics item-analysis display update
   - Date: August 1, 2026
   - Evidence file: `src/components/AnalyticsView.tsx`
   - Work summary: item analysis now favors whole-number correct-student counts instead of percentage-only success rate display

11. Mobile sync payload timestamp and score verification
   - Date: August 1, 2026
   - Evidence files: `src/database/syncService.ts`, `docs/message-to-frontend-ai-sync-payload.md`
   - Work summary: upload payload now carries actual upload timestamp, max score, checked timestamp, item update timestamp, raw answers, weighted total score, and stable `testPartId` plus per-part `itemNumber` mapping

12. Fixed-template offline OMR prototype validation
   - Date: August 9, 2026
   - Evidence file: `docs/mobile-omr-prototype-test-2026-08-09.md`
   - Work summary: generated and printed a 10-item A4 OMR sheet, aligned a photographed sheet, detected strong marks, preserved a deliberate multiple mark, and routed unclear marks to teacher verification

13. Isolated OMR identity and scanner-contract refinement
   - Date: August 9, 2026
   - Evidence file: `docs/mobile-omr-prototype-specification-2026-08-09.md`
   - Work summary: added QR-based test/student identity, MC and T/F template variants, marker-based calibration, stable scanner evidence fields, and explicit separation from production SQLite/sync

14. Physical Multiple Choice OMR accuracy and verification-routing validation
   - Date: August 10, 2026
   - Evidence files: `D:\ThesisProjects\OMRPrototype\OMR_PHYSICAL_TEST_REPORT_2026-08-10.md`, `docs/mobile-omr-prototype-test-2026-08-09.md`
   - Work summary: validated QR identity and four-marker alignment, achieved 10/10 exact clean-answer detection, and safely routed blanks and an A/D multiple mark to teacher verification without production integration
## Limitation

This file only records dates that are directly evidenced in the current mobile repo snapshot. If you need a fuller Gantt chart for actual implementation milestones, I would need one of these:

- commit history with dated commits
- your team logbook
- task tracker exports
- backend/frontend deployment notes with dates

