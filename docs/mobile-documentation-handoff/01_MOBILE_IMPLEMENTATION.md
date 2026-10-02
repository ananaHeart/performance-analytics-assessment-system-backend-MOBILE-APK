# Mobile Implementation Documentation

Document snapshot: August 22, 2026

## 1. Current Implementation Summary

The current working mobile module is a teacher-facing React Native application
for checking paper-based assessments. Students do not answer inside the app.
The teacher downloads assigned data, records item correctness while checking
physical papers, saves work locally, and manually synchronizes checked results.

Current V1 flow:

Teacher login
-> download assigned data
-> select class
-> select assessment
-> search or select student
-> manually mark checked items
-> save to SQLite
-> manually upload the selected assessment
-> backend stores or updates results
-> web reads synchronized results

The isolated OMR prototype is not part of this current flow.

## 2. Mobile Technology

| Area | Current technology | Evidence |
| --- | --- | --- |
| Frontend framework | React Native CLI 0.83.1 with React 19.2.0 | package.json |
| Languages | TypeScript and JavaScript | App.tsx and src files |
| JavaScript engine | Hermes | android/gradle.properties |
| React Native architecture | New Architecture enabled; Fabric/JSI runtime | android/gradle.properties |
| Local database | SQLite through react-native-quick-sqlite 8.2.7 | package.json and src/database/db.js |
| Navigation | Application state in App.tsx; no React Navigation package | App.tsx and package.json |
| API communication | Fetch-based JSON REST calls | authService.ts, db.js, syncService.ts |
| Icons | lucide-react-native | package.json and components |
| Development bundler | Metro | React Native CLI scripts |
| Android build | Gradle through the React Native Android project | android directory |

The current API configuration uses automatic target selection:

- Android emulator -> http://10.0.2.2:8080
- normal physical/release device -> deployed cloud backend
- physical local-network target -> available through an explicit configuration

Source: src/config/api.ts.

## 3. Main Screens and Functions

### Login

- Accepts teacher email or username and password.
- Calls the Spring Boot authentication endpoint.
- Teachers are expected to use accounts created outside the mobile app.
- Mobile teacher registration is not part of the current workflow.

Sources: src/components/LoginScreen.tsx and src/services/authService.ts.

### Classes

- Displays downloaded teacher class assignments.
- Class cards show grade/section, subject, and student count context.
- Selecting a class loads its downloaded assessments.

Sources: App.tsx and src/components/NavigationLists.tsx.

### Assessments

- Displays assessments belonging to the selected class.
- Shows local upload/checking status where data is available.
- Selecting an assessment opens the checking workflow.

Sources: App.tsx and src/components/NavigationLists.tsx.

### Student Selection

- Loads the roster associated with the selected class and assessment.
- Supports student search and selection.
- Student names are displayed in LASTNAME, FIRSTNAME format in the current
  teacher-facing lists.

Sources: App.tsx and src/components/StudentList.tsx.

### Touch-Based Checking

- Items are grouped by test part.
- Items default to correct when no saved response exists.
- The teacher taps an item to toggle correct/incorrect.
- Green represents correct and red represents incorrect.
- Multiple Choice-style short answers use a compact grid.
- Longer objective answers use wider or line-based controls.
- Item changes are written to SQLite immediately.
- Save Student persists the complete displayed response set.

Source: src/components/CheckingGrid.tsx.

### Local Analytics

The Analytics screen uses locally stored checked data and currently includes:

- checked, synced, and unsynced counts;
- competency performance;
- item analysis using correct-student counts such as 5/8;
- student score listing; and
- class and assessment selectors.

These are preliminary mobile analytics. Backend/web analytics remain the
authoritative reporting layer after synchronization.

Sources: src/components/AnalyticsView.tsx and analytics queries in
src/database/db.js.

### Profile and Synchronization

- Displays teacher/account information.
- Opens the Synchronization view.
- Allows manual download of assigned data.
- Allows selected-test or class-scoped upload actions.
- Displays class-specific sync summaries and last-sync information when stored.

Source: App.tsx.

## 4. Offline Behavior

The application is offline-writable, not only offline-readable:

- downloaded classes, students, assessments, test parts, answer keys, and
  competencies are stored in SQLite;
- checking changes are saved locally before upload;
- the teacher may continue checking without continuous internet;
- unsynced rows remain local until a successful upload marks them synced; and
- synchronization is manually initiated.

Network access is still required for login, download, and upload.

## 5. Current SQLite Usage

| Local table | Current responsibility |
| --- | --- |
| users | Minimal local teacher/session support |
| classes | Downloaded teacher class assignments |
| students | Downloaded student records and roster fields |
| student_enrollments | Local class/section/year roster relationships |
| tests | Downloaded assessments |
| test_parts | Test-part metadata, item count, points, and answer key |
| competencies | Downloaded competency metadata |
| test_results | Per-student checked result and local sync state |
| item_responses | Per-part, per-item correctness and sync state |
| class_sync_metadata | Last successful sync timestamp by class |
| session_metadata | Minimal local session metadata |

Sources: src/database/schema.js and src/database/db.js.

Current V1 item_responses store correctness rather than a complete
teacher-confirmed selected option tied to authoritative V2 questionId. They
must not be documented as final V2 student_answers.

## 6. Score Computation

Local score computation is weighted by test part:

score = sum(points_per_item for every locally correct response)

max score = sum(points_per_item for every item in every test part)

The mobile UI updates the score after item changes. The upload payload includes
totalScore and maxScore. This fixes the historical problem where a weighted
score could appear as 25/20 when 20 represented only the item count.

Sources: src/components/CheckingGrid.tsx, src/database/db.js, and
src/database/syncService.ts.

For the planned V2 workflow, backend scoring from verified answers will become
authoritative. That V2 behavior is not implemented in the current V1 app.

## 7. Download Workflow

Current endpoint:

GET /api/sync/download/{teacherId}

The mobile mapper currently accepts downloaded:

- classes;
- students and enrollment context;
- tests;
- testParts;
- competencies;
- previously uploaded testResults; and
- previously uploaded itemResponses.

Downloaded reference rows use replace/upsert-oriented storage. Previously
uploaded result rows are restored as synced records. Unsynced local work for
the same student and test is preserved instead of being overwritten.

Source: src/database/db.js.

## 8. Upload Workflow

Current endpoint:

POST /api/sync/upload

Normal teacher upload is selected-test scoped. The payload includes:

- teacherId;
- testId;
- uploadedAt with a local UTC offset;
- per-student localResultId, totalScore, maxScore, rawAnswers, and checkedAt;
- per-item localResponseId, testPartId, itemNumber, isCorrect, and updatedAt.

Only unsynced checked results are included. Rows are marked synced only after a
successful server response. A global upload-all function exists for
administrative/debug use but is not the normal teacher workflow.

Source: src/database/syncService.ts.

## 9. Restore Behavior

Restore is implemented in the V1 download path:

1. Previously uploaded backend test results are downloaded.
2. Mobile creates stable local identifiers based on backend result IDs.
3. Related item responses are restored and marked synced.
4. If unsynced local work already exists for the same student and test, the
   downloaded backend result is skipped to protect local work.

This supports recovery after local app data has been cleared, provided the
results were successfully uploaded before the reset.

Source: restoreDownloadedBackendResults in src/database/db.js.

## 10. Current Boundaries

- The current app uses V1 authentication and V1 sync endpoints.
- The separately tested Python/OpenCV scanner remains prototype evidence.
- As of August 18, App.tsx imports an Android-native OpenCV scanner modal and
  initializes the separate V2 SQLite database.
- Camera/gallery acquisition, fixed-template MC detection, and teacher review
  exist in source, but require a fresh Android build/device validation.
- The teacher review is allowed to write only to isolated V2 storage when the
  authoritative downloaded V2 test, class-list, and question context exists.
- No V2 download or upload network service is currently called by the app.
- V2 upload, backend scoring from verified answers, and production V2 database
  migration are pending.
- The current production-ready workflow therefore remains V1 manual checking;
  partial phone OMR source must not be described as deployed end to end.
- Identification and Enumeration remain manually checked; they are not
  currently OMR-scanned.
