# Mobile Development Timeline

Document snapshot: August 22, 2026

## Timeline Method

The current Git history does not record the actual sequence of most mobile
changes. It contains only one initial commit dated February 11, 2026, while
most current mobile files are modified or untracked.

This timeline therefore uses:

- dated mobile worklogs and reports;
- existing documentation records;
- source evidence;
- user-reported deployment/testing milestones; and
- approximate periods when an exact date is not available.

An evidence date proves that work was documented or tested by that date. It
does not automatically prove the original implementation date.

## Chronological History

| Date or period | Mobile activity | Status | Evidence and qualification |
| --- | --- | --- | --- |
| February 11, 2026 | React Native project baseline committed | Completed baseline | Only dated Git commit in this checkout; it does not contain the later feature history |
| By May 27, 2026 | Teacher-side mobile checking, SQLite, and backend sync were documented | Completed by this date; exact implementation date Needs confirmation | MOBILE_APP_DOCUMENTATION.md document record |
| June 15, 2026 | Checking-screen redesign focused on touch efficiency, compact student selection, and default-correct marking | Completed design/revision | mobile-ui-worklog-june-15-16-2026.md |
| June 16, 2026 | Student-search visibility fix and local Analytics UI direction documented | Completed revision and planning | mobile-ui-worklog-june-15-16-2026.md |
| June 16, 2026 | Classes, Analytics, and Profile navigation direction confirmed | Completed UI direction | Same worklog; current App.tsx contains these tabs |
| July 30, 2026 | Spring Boot backend redeployed to cloud and tested with frontend/cloud database | User-reported completed backend milestone | Recorded in MOBILE_GANTT_CHART_EVIDENCE.md; backend event included only because it enabled mobile cloud preparation |
| July 31, 2026 | Mobile SQLite reviewed against the then-current backend SQL export | Completed review | MOBILE_APP_DOCUMENTATION.md and MOBILE_GANTT_CHART_EVIDENCE.md |
| July 31, 2026 | Added grading-period compatibility and removed normal-startup fake assessment creation | Completed mobile compatibility update | schema.js/db.js behavior and dated documentation |
| July 31, 2026 | Restore/upsert and edited-result synchronization behavior documented | Completed previously; needs current end-to-end regression | MOBILE_APP_DOCUMENTATION.md |
| August 1, 2026 | Mobile prepared for cloud-backend testing and Android release APK build | Completed at that time; current APK needs confirmation | mobile-worklog-august-01-2026.md |
| August 1, 2026 | Weighted score payload, maxScore, uploadedAt, checkedAt, and item updatedAt refined | Completed code revision | syncService.ts and dated worklog |
| August 1, 2026 | Item mapping confirmed by testPartId plus part-local itemNumber | Completed mobile payload revision | syncService.ts and frontend handoff note |
| August 1, 2026 | Item analysis changed from percentage-only output to correct-student counts such as 5/8 | Completed UI revision | AnalyticsView.tsx and dated worklog |
| Early August 2026 | Android emulator, native SQLite loading, and local table-initialization problems were debugged | Worked on; permanent cross-device status Needs confirmation | Developer test history; exact date and final regression record are incomplete |
| Early August 2026 | API target behavior evolved to emulator-local and physical-device cloud selection | Current code present; exact change date Needs confirmation | src/config/api.ts |
| August 9, 2026 | First fixed-template offline Python/OpenCV OMR test completed | Prototype-validated only | mobile-omr-prototype-test-2026-08-09.md |
| August 9, 2026 | OMR template/map, detection statuses, confidence evidence, and teacher-verification rules documented | Prototype documentation completed | mobile-omr-prototype-specification-2026-08-09.md |
| August 10, 2026 | QR-enabled physical Multiple Choice test achieved 10/10 exact detection | Prototype-validated only | OMR_PHYSICAL_TEST_REPORT_2026-08-10.md |
| August 10, 2026 | Physical blanks/double marks were routed to uncertain or multiple_marks; QR fallback and four-marker alignment were corrected | Prototype-validated fixes | Physical report and preserved output folders |
| August 15, 2026 | V1 production behavior and pending V2 OMR workflow were formally separated | Documentation completed | MOBILE_V1_V2_OMR_BOUNDARY_AND_WORKFLOW.md |
| By August 15, 2026 | Isolated V2 SQLite design files existed under src/database/v2 | In progress, not integrated or tested | contracts.ts, schema.ts, database.ts, downloadRepository.ts, uuid.ts |
| August 17, 2026 | Mobile documentation-manager handoff package prepared | Completed documentation task | docs/mobile-documentation-handoff |
| August 18, 2026 | Android-native OpenCV OMR source, camera/gallery bridge, teacher-review modal, and conditional isolated V2 save were added | Partial mobile V2 integration; runtime Needs confirmation | OmrDetector.kt, OmrScannerModule.kt, OmrScannerModal.tsx, resultRepository.ts, and file timestamps |
| August 18, 2026 | Automatic API routing was present for emulator-local development and cloud standalone/physical use | Source-confirmed; runtime Needs confirmation | src/config/api.ts timestamp and current source |
| August 22, 2026 | V1/V2 backend connectivity and SQLite compatibility were re-audited | Completed documentation/code audit; no runtime test | V1 endpoints remain wired; V2 DTO/schema exist but V2 network service is absent |

## Major Revisions

### Manual Checking UI Revision

Period: June 15-16, 2026

- prioritized touch-based checking;
- retained default-correct behavior;
- improved compact student switching;
- separated test parts; and
- established local analytics screen direction.

### Backend/SQLite Alignment Revision

Period: July 31, 2026

- compared the mobile schema with the current backend export;
- added local grading-period compatibility;
- protected downloaded IDs from local demo-record collisions;
- preserved unsynced local work during restore; and
- documented selected-test sync behavior.

### Cloud and Payload Revision

Date: August 1, 2026

- prepared Android/cloud testing;
- added exact upload timestamp data;
- added weighted maxScore;
- preserved test-part item mapping; and
- changed item analytics to teacher-friendly correct-student counts.

### OMR Direction

Period: August 9-10, 2026

- generated and tested fixed A4 templates;
- validated page alignment and bubble detection;
- recorded raw evidence and detection statuses;
- confirmed teacher-verification necessity; and
- kept the prototype isolated from React Native, SQLite, sync, backend, and
  TiDB/MySQL.

### V1/V2 Boundary

Date: August 15, 2026

- retained V1 as the current working mobile application;
- classified OMR as an isolated prototype;
- classified V2 SQLite/API integration as pending; and
- prevented planned V2 behavior from being described as deployed.

### Partial Phone OMR Integration

Date: August 18, 2026

- added Android-native OpenCV for the fixed ten-item MC template;
- added camera and gallery image acquisition;
- added teacher review and correction before save;
- added conditional save into the separate V2 SQLite database; and
- retained the V1/V2 boundary because no V2 network download/upload was wired.

### Connectivity and Compatibility Audit

Date: August 22, 2026

- confirmed current V1 download/upload wiring;
- listed the 20 isolated V2 SQLite tables;
- confirmed structural alignment with V2 identities, statuses, UUIDs, and
  result relationships; and
- classified V2 download, V2 upload, backend scoring, and end-to-end OMR as
  pending.

## Dates That Need Confirmation

- Original date when manual checking first became functional.
- Original date when the first SQLite schema and V1 sync endpoints were added.
- Exact date of the current automatic emulator/cloud API target logic.
- Exact date and device build confirming permanent resolution of native SQLite
  emulator startup issues.
- Latest successful end-to-end V1 cloud regression after August 1, 2026.
- Exact date when the incomplete src/database/v2 scaffold was first created.
- Fresh Android build and physical-phone validation of the August 18 native
  scanner source.
- First successful V2 download, verified OMR save with downloaded context, and
  retry-safe V2 upload; none was confirmed by the August 22 audit.
