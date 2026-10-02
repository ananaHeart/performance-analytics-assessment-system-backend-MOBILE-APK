# Mobile Documentation Status

Document snapshot: August 22, 2026

Status in this file refers to the mobile side only. Backend/frontend status is
mentioned only when it directly controls whether a mobile flow can be verified.

## Completed

### Current V1 Application

- React Native teacher application structure.
- Teacher login interface and backend authentication call.
- Class selection from downloaded assignments.
- Assessment selection under the chosen class.
- Student roster, search, and selection.
- Touch-based correct/incorrect checking.
- Default-correct item behavior.
- Test-part grouping and per-part answer-key display.
- Immediate local save through SQLite.
- Weighted local score and weighted maximum-score computation.
- Local tables for users, classes, students, enrollments, tests, test parts,
  competencies, results, item responses, and sync metadata.
- Preliminary local competency and item analytics.
- Manual V1 download.
- Selected-test manual V1 upload.
- Upload timestamps with local UTC offset.
- Upload payload fields for totalScore, maxScore, rawAnswers, checkedAt,
  testPartId, itemNumber, isCorrect, and updatedAt.
- Restore of previously uploaded results through download.
- Protection of unsynced local results during backend restore.
- Automatic emulator/local versus physical/cloud API target selection is
  present in current source.

### Isolated OMR Prototype

- Fixed A4 template generation.
- Scanner-coordinate JSON map generation.
- Four-corner perspective alignment.
- QR decode fallback.
- Multiple Choice A-D bubble detection.
- Structured raw confidence/mark output.
- Detected, blank, multiple_marks, and uncertain status handling.
- Physical clean MC test with 10/10 exact detection.
- Physical multiple-mark and uncertainty-routing test.
- Teacher verification requirement established in the prototype design.

These OMR items are Completed only as isolated prototype work, not as mobile
application integration.

## In Progress

- OMR threshold tuning for blank versus uncertain physical marks.
- Larger physical-image validation set.
- V2 mobile/backend contract alignment.
- Isolated V2 SQLite schema and repositories under src/database/v2.
- Documentation separation of current V1, OMR prototype, and target V2.
- Android-native ten-item Multiple Choice scanner source, camera/gallery
  bridge, teacher review, and conditional isolated V2 save. Source exists as of
  August 18; fresh runtime validation is still required.
- Runtime validation of the teacher-verification screen and retry-safe result
  lifecycle.

App.tsx now initializes the separate V2 database and imports the scanner modal,
but no V2 download/upload service is wired and the August 18 native changes
were not validated by a fresh mobile build during the August 22 audit. This
must not be called completed V2 integration.

## Planned

- Production hardening and acceptance testing of the existing React Native
  camera/document-capture source.
- Physical-device acceptance testing of the on-device OpenCV integration.
- Whole-sheet scan regression after class, assessment, and student selection.
- QR/template validation against downloaded V2 assessment context.
- Teacher-review acceptance for blank, uncertain, and multiple-mark detections.
- Separate storage of raw detections and teacher-verified answers.
- V2 SQLite migration after the schema/API contract is frozen.
- Stable syncUuid, resultUuid, scanUuid, and answerUuid retry behavior.
- V2 batch upload grouped by one assessment/test.
- Partial-success retry handling.
- Backend authoritative scoring from verified answers.
- Web V2 analytics/intervention integration.
- End-to-end Android acceptance testing.

## Not Implemented

- Production-approved end-to-end OMR scanning connected to V2 download/upload.
- Production mobile teacher-verification UI.
- OMR persistence in current V1 SQLite.
- Production V2 SQLite initialization/migration.
- Production POST /api/v2/sync/upload integration.
- Mobile GET /api/v2/sync/download network integration.
- V2 backend scoring from mobile verified answers.
- OMR-based Identification checking.
- OMR-based Enumeration checking.
- Handwriting recognition or OCR grading.
- Arbitrary paper-layout detection.
- Multi-page or mixed-question-type OMR sheets.
- Automatic background synchronization.
- A complete automated unit/integration/end-to-end mobile test suite.

## Needs Confirmation

- Exact original implementation dates before May 27, 2026.
- Latest successful login against the currently deployed backend.
- Latest successful V1 download against the currently deployed backend.
- Latest selected-test upload and edited-result upsert.
- Backend/web display of uploadedAt and weighted maxScore.
- Restore after clean reinstall using the latest backend dataset.
- Duplicate-free repeated download after the historical test_parts constraint
  error.
- Native SQLite startup on all intended emulator/API levels.
- Current release APK path, build date, and install result after later changes.
- Physical-device behavior of automatic cloud target selection.
- Physical True/False OMR test.
- Phone-side True or False detector and review flow.
- Fresh build/device validation of the August 18 native MC scanner source.
- Final QR contents after database and API contracts are frozen.
- Final target phone list and low-end device performance.

## Historical Designs Kept Separate

The following must not be merged into the current implementation description:

- older storyboard screens that are not present in current source;
- proposed V2 camera/verification screens;
- proposed V2 entities and UUID contracts;
- Python/OpenCV prototype output;
- proposed backend scoring and analytics;
- future Identification/Enumeration scanning.

Use the label Historical design, Prototype, In Progress, or Planned when these
items appear in Chapter IV.
