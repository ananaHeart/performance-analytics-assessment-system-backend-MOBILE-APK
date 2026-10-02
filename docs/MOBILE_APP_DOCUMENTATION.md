# Mobile App Documentation

Document record:
- Created: May 27, 2026
- Last updated: August 10, 2026
- Date evidence: filesystem creation and last modified timestamps in `D:\ThesisProjects\MobileAssessmentApp\docs`
- Current database reference: `C:\Users\ADMIN\Downloads\performance_assessment_db (1).sql`, reviewed on July 31, 2026

## 1. Overview
The mobile application serves as the teacher-side checking component of the Performance Analytic Assessment System. It enables teachers to download assigned academic data, check paper-based assessments on a mobile device, store results locally using SQLite, and synchronize checked records with the Spring Boot backend. The application is designed with an offline-first approach so that checking may continue even when continuous network connectivity is not available.

## 2. Technology Stack
- React Native CLI
- TypeScript / JavaScript
- Hermes JavaScript engine
- React Native New Architecture (`JSI` + `Fabric`)
- `react-native-quick-sqlite`
- Spring Boot REST API backend
- MySQL backend database
- Metro bundler for development

## 3. React Native Runtime Notes

### Core execution layers used by the app
- JavaScript thread
- Native UI/Main thread
- Native module/background threads
- React Native C++ runtime layer used by the New Architecture

### JavaScript engine
The application uses `Hermes` as its JavaScript engine.

### Bridge / interop layer
The application runs with the React Native New Architecture enabled. In this setup, the important JavaScript-to-native interop layer is `JSI` (`JavaScript Interface`) rather than the old bridge-first model.

### Rendering system
The application uses `Fabric` as its rendering system.

### Render phase and shadow thread
The rendering flow is:

`JavaScript thread`  
-> React render / reconciliation  
-> `Shadow thread` builds the Shadow Tree and computes layout  
-> `UI thread` mounts and draws the final native views

In this documentation:
- `Render phase` means the React reconciliation phase where React computes the next UI tree.
- `Shadow thread` means the React Native layout thread where layout is calculated before committing to the visible native UI.

### TurboModules and Codegen
The project is New-Architecture-enabled, so it can use `TurboModules` and `Codegen`. However, the current repository does not appear to define custom TurboModules or custom Codegen specs.

## 4. Mobile App Purpose
The mobile application supports the following teacher-side functions:

- Teacher login through the backend authentication API
- Download of assigned classes, students, tests, test parts, and competencies
- Offline checking of student paper-based assessments
- Manual upload of checked results to the backend
- Restoration of previously uploaded results after local mobile data is cleared

## 5. Mobile User Flow
The current end-to-end user flow is as follows:

1. The teacher logs in to the mobile application.
2. The teacher downloads sync data from the backend.
3. The teacher selects a class.
4. The teacher selects a test under the chosen class.
5. The teacher selects a student.
6. All test items default to correct when no saved responses exist.
7. The teacher taps only the wrong answers to mark them incorrect.
8. Results are saved locally in SQLite.
9. The teacher manually uploads the current selected test.
10. Web dashboard analytics are updated after successful backend upload.
11. If local mobile data is cleared, the teacher downloads sync data again to restore previously uploaded results.

## 6. Backend API Used by Mobile

### Login
`POST /api/auth/login`

This endpoint authenticates the teacher account and returns the backend user context required by the mobile application.

### Download Sync
`GET /api/sync/download/{teacherId}`

Downloaded data currently includes:

- `classes`
- `students`
- `tests`
- `testParts`
- `competencies`
- `testResults`
- `itemResponses`

### Upload Sync
`POST /api/sync/upload`

Uploaded payloads currently include:

- `teacherId`
- `testId`
- `uploadedAt`
- `testResults`
- `testResults[].totalScore`
- `testResults[].maxScore`
- `testResults[].rawAnswers`
- `testResults[].checkedAt`
- `itemResponses`
- `itemResponses[].testPartId`
- `itemResponses[].itemNumber`
- `itemResponses[].isCorrect`
- `itemResponses[].updatedAt`

## 7. Offline-First Behavior
The mobile application follows an offline-first design. Checking results are saved first to local SQLite storage before any upload occurs. A teacher may continue checking without immediate synchronization to the backend. Upload is manual rather than automatic.

The normal teacher upload path is `Upload Current Test`. This upload behavior is limited to checked and unsynced results for the selected test only. Unchecked students are not uploaded. Rows already marked as synced are skipped during normal upload.

This application is not only offline-readable. It is also offline-writable. Teachers can continue actual assessment-checking work while offline, and the recorded work is stored locally first for later synchronization.

## 8. Synchronization Model
The application uses both synchronization directions:

- `Pull-based synchronization`
  - mobile downloads assigned classes, students, tests, test parts, competencies, and previously uploaded backend results
  - endpoint: `GET /api/sync/download/{teacherId}`
- `Push-based synchronization`
  - mobile uploads locally checked unsynced records to the backend
  - endpoint: `POST /api/sync/upload`

## 9. Sync Status Rules
The selected-test status values are interpreted as follows:

Checked = student has local `test_result` for selected test  
Synced = checked result has `is_synced = 1`  
Unsynced = checked result has `is_synced = 0`  
Unchecked = no local `test_result` for selected test

Example:

Checked: 1 / 3  
Synced: 1 / 3  
Unsynced: 0  
Unchecked: 2

## 10. Local SQLite Tables
The mobile application uses the following local SQLite tables:

- `classes`
  Stores downloaded class assignments for the logged-in teacher.
- `students`
  Stores downloaded student profile records and flattened enrollment fields used by mobile filtering.
- `student_enrollments`
  Stores local enrollment relationships used for strict roster filtering by section, grade level, and academic year.
- `tests`
  Stores downloaded tests assigned to the teacher’s classes.
- `test_parts`
  Stores test-part metadata, answer keys, item counts, and scoring details.
- `competencies`
  Stores downloaded competency metadata linked to test parts.
- `test_results`
  Stores local checked assessment results per student per test.
- `item_responses`
  Stores local item-level correctness values per checked result.
- `class_sync_metadata`
  Stores the last successful sync timestamp per downloaded class for the Synchronization screen.
- `session_metadata`
  Stores minimal local session-related metadata.

Downloaded backend records are saved using upsert or replace behavior so that repeated downloads do not create duplicate rows unnecessarily.

## 11. Current Database Alignment
On July 31, 2026, the mobile SQLite schema was reviewed against the current exported backend database file:

`C:\Users\ADMIN\Downloads\performance_assessment_db (1).sql`

The current backend tables relevant to mobile sync are:

- `class`
- `student`
- `student_enrollment`
- `test`
- `test_part`
- `competency_tags`
- `test_result`
- `test_item_result`

The mobile SQLite schema intentionally keeps local table names optimized for offline use:

- backend `test` maps to mobile `tests`
- backend `test_part` maps to mobile `test_parts`
- backend `test_result` maps to mobile `test_results`
- backend `test_item_result` maps to mobile `item_responses`

The July 31, 2026 mobile database update added compatibility for backend `test.grading_period_id` by adding local `tests.grading_period_id`. This field is stored locally if the backend sync response includes either `gradingPeriodId` or `grading_period_id`.

The mobile app does not store deeper analytics tables locally at this stage. Tables such as `part_skill_mapping`, intervention records, LMS analytics, item analysis outputs, and branch-level skill analytics remain backend-side responsibilities unless offline analytics display becomes a required mobile feature.

The mobile database update also removed automatic creation of a fake local assessment/test part during normal app initialization. This avoids local ID collisions with downloaded backend records and supports the cloud-backed demo flow.

## 12. Restore Behavior
If the teacher clears local phone data but has already uploaded results to the backend, the application can restore those uploaded records through Download Sync.

Backend `testResults` are restored into local `test_results` using:

- `local_result_id = backend-{testResultId}`
- `is_synced = 1`

Backend `itemResponses` are restored into local `item_responses` using:

- `local_response_id = backend-item-{itemResultId}`
- `is_synced = 1`

Item responses are linked back to restored test results using:

- `local_result_id = backend-{testResultId}`

This restore process allows previously uploaded checked records to reappear on the mobile device after a local reset.

## 13. Conflict Behavior
The current mobile synchronization logic does not implement a true `last-write-wins` conflict strategy.

The practical behavior is:

- unsynced local work is protected from being overwritten by downloaded backend records
- backend restore is skipped when an unsynced local row already exists for the same test and student
- local rows are marked as synced only after a successful upload

So the current conflict rule is better described as:

`preserve unsynced local records, then sync explicitly`

not:

`last write wins`

## 14. Upload Scope
Normal teacher upload is scoped to the selected test only.

`Upload Current Test`:

- uploads only unsynced checked results for the selected `testId`
- does not upload other tests or classes
- does not upload unchecked students

`Upload All Unsynced`:

- is kept only for Admin/Debug use
- is not the normal teacher workflow

## 15. Duplicate Prevention
The mobile application includes several duplicate-prevention mechanisms:

- Download uses upsert or replace behavior for downloaded records.
- Repeated downloads do not duplicate students, tests, or test parts.
- Restored backend `testResults` and `itemResponses` use stable local identifiers during restoration.
- Already synced rows are skipped during normal upload.
- Backend-side upload processing updates existing uploaded results and item responses when the mobile app re-syncs edited checked records.

## 16. Testing Procedure

### Required Running Services
- Spring Boot backend running locally or deployed in the cloud
- MySQL/TiDB backend database running locally or in the cloud
- Metro running for React Native development

### Commands

Backend:

```powershell
cd D:\CAPSTONE_2\backend\assessment
.\mvnw spring-boot:run
```

Mobile Metro:

```powershell
cd D:\ThesisProjects\MobileAssessmentApp
npx react-native start
```

### Test Flow
1. Login as teacher.
2. Download Sync Data.
3. Select class.
4. Select test.
5. Check one or more students.
6. Upload Current Test.
7. Verify web analytics.
8. Reset Local DB.
9. Download Sync Data again.
10. Confirm uploaded results are restored.

## 17. Current Confirmed Working Features
The following features are currently documented as working in the present mobile flow:

- Backend login works
- Download Sync works
- Class/test/student selection works
- Default-correct checking works
- Manual Upload Current Test works
- Partial upload works
- Web analytics reflects uploaded results
- Restore after local reset works
- Current mobile SQLite schema supports the working backend/cloud database sync flow
- Local demo assessment creation no longer runs during normal database initialization
- Re-syncing edited mobile results updates existing backend `test_result` and `test_item_result` rows

## 18. August 1, 2026 Mobile Build and Sync Payload Update
On August 1, 2026, the mobile project was prepared for cloud-backend app building and result-sync verification.

Confirmed mobile-side work:

- Mobile API configuration was pointed to the deployed Spring Boot backend: `https://performance-analytics-assessment-system.onrender.com`.
- Android release APK build was confirmed from the mobile project using Gradle.
- Mobile analytics item analysis display was adjusted from percentage-only success rate to teacher-friendly correct-student counts, such as `5/8`.
- Mobile sync/result payload was verified before blaming backend or web display issues.
- Mobile upload now includes actual upload timestamp as `uploadedAt` using ISO local-offset format, for example `2026-07-31T17:08:00+08:00`.
- Mobile upload now includes `maxScore` per test result so weighted assessments can display scores correctly.
- Mobile upload keeps weighted `totalScore`, `rawAnswers`, `testPartId`, per-part `itemNumber`, and item correctness values.
- Part 1 and Part 2 item ranges are preserved by `testPartId` plus per-part `itemNumber`; mobile does not remap items into a shifted global item index during sync.
- Student display format remains `LASTNAME, FIRSTNAME`, for example `CRUZ, MIGUEL`.

Backend/web coordination note:

- Backend must accept and store/use `uploadedAt` and `maxScore` before web can reliably show the exact mobile sync timestamp and weighted score denominator.
- Web should group item analysis by `testPartId` and `itemNumber`, not by item number alone.
## 19. Known Future Improvements
The following items remain future improvement areas:

- Full UI redesign based on storyboard
- Better mobile screen layout
- Better status badges
- Web-based correction and resubmission workflow
- Better audit trail for corrected uploaded results
- Final removal or hiding of developer and debug buttons

## 20. August 9, 2026 Fixed-Template OMR Prototype Test

The first controlled fixed-template OMR test was completed on August 9, 2026.
This was an offline Python/OpenCV prototype test and was not yet integrated into
React Native, SQLite, synchronization, Spring Boot, or TiDB/MySQL.

Confirmed during the test:

- A system-generated A4 bubble sheet and scanner-coordinate JSON map were used.
- The active test sheet contained 10 items with A-D options.
- The photographed paper was detected and perspective-aligned.
- Bubble positions were read from the generated map and corrected against the
  actual printed circle centers.
- Strong marks were detected and a deliberate A/B double mark was flagged.
- Unclear marks remained uncertain for teacher verification instead of being
  silently finalized.
- Q1 was intended as A but required verification because the photographed mark
  did not provide enough confidence for automatic confirmation.

Detailed evidence and results are recorded in
`docs/mobile-omr-prototype-test-2026-08-09.md`.

The isolated scanner specification, QR identity contract, MC/T/F scope,
detection thresholds, teacher-correction flow, output example, and known errors
are recorded in `docs/mobile-omr-prototype-specification-2026-08-09.md`.

The separate backend V2 database has been created and validated, while current
production SQLite, backend V1, and TiDB remain unchanged. OMR output is still
kept separate from production storage and synchronization.

## 21. August 10, 2026 Physical OMR Validation

The QR-enabled fixed-template Multiple Choice scanner was tested using two new
physical answer-sheet photographs. Current approved OMR prototype scope is
Multiple Choice only.

Clean-answer validation:

- QR identity matched template `OMR-A4-10-MC-CTX-V2`, `testId=101`, question
  type, and item count.
- Four original printed corner markers were used for perspective alignment.
- Expected answers `A, B, C, D, A, B, C, D, A, B` were detected exactly.
- Result: 10 of 10 exact answer detections.

Verification-routing validation:

- Six intentional single A marks were detected correctly.
- Three blank items produced no selected option and were routed as `uncertain`.
- One A/D double mark produced no selected option and was routed as
  `multiple_marks` while preserving both raw marks.
- No unclear item was silently converted into a final student answer.

The physical tests also led to two isolated prototype corrections: enlarged
top-right QR decode fallbacks and direct four-marker perspective alignment.
The second test confirms why teacher verification remains mandatory. Blank
versus uncertain classification still requires tuning with a larger labeled
physical-image set.

Full report:

`D:\ThesisProjects\OMRPrototype\OMR_PHYSICAL_TEST_REPORT_2026-08-10.md`

Preserved evidence:

- `D:\ThesisProjects\OMRPrototype\output\physical_mc_v2_clean`
- `D:\ThesisProjects\OMRPrototype\output\physical_mc_v3_edge_cases`

Production React Native code, SQLite, sync, Spring Boot, and TiDB/MySQL were not
modified or connected during these tests.

