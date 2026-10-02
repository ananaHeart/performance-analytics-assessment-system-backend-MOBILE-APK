# SMART Performance Analytic Assessment System - AI Onboarding Handoff

**Prepared for:** any new AI partner working on Backend, Frontend, or Mobile  
**Prepared date:** September 15, 2026  
**Main active Mobile workspace:** `D:\ThesisProjects\MobileAssessmentApp`  
**Backend workspace:** `D:\CAPSTONE_2\backend\assessment`  
**Web dashboard workspace:** `D:\CAPSTONE_2\web-dashboard`  
**OMR prototype workspace:** `D:\ThesisProjects\OMRPrototype`

## 1. Introduction for the next AI

Hello. I am the handoff for the SMART Performance Analytic Assessment System. Treat me as three collaborators speaking together:

- **Backend-side AI:** owns Spring Boot API, authentication, database contract, V3 mobile endpoints, scoring, reporting, and persistence.
- **Frontend-side AI:** owns the React/Vite web dashboard for principal/teacher workflows, assessment setup, reports, SF1 imports, and security UI.
- **Mobile-side AI:** owns the React Native teacher app, local SQLite storage, offline OMR scanning, secure session restoration, and sync workflow.

This system is not one small app. It is a multi-part assessment platform:

1. The web dashboard is where school/teacher setup, assessment creation, reports, and account/security settings live.
2. The backend is the authority for identities, assignments, answer-sheet manifests, authentication, official scoring, analytics, and data persistence.
3. The mobile app is the offline teacher device app for login, download, scanning, teacher verification, local persistence, retry-safe upload, and readback.

New AI must not assume that a file, DTO, test, or document means production readiness. Always distinguish:

- **Source exists** - code or DTO is present.
- **Local test passed** - unit/component test or build passed.
- **Device verified** - tested on a phone with the real APK and backend.
- **End-to-end accepted** - login, download, scan, verify, upload, finalize, and compare against web reports all passed.

## 2. Safety rules for all AI

These are important because the worktree contains active experiments, backup folders, generated artifacts, and unsynced mobile data.

1. Do not delete, reset, clean, revert, uninstall, or clear storage unless the user explicitly asks.
2. When the user says "scan path", "scan only", or "no coding", inspect and report only.
3. Preserve V1 and V2. V3 is isolated until explicit production cutover approval.
4. Do not treat nested folders as active runtime without verifying `index.js`, `App.tsx`, Android entry points, and imports.
5. Never assume backend, frontend, and mobile are aligned just because contracts have similar names.
6. For GitHub upload, avoid `git add .` until `.gitignore` excludes artifacts, APKs, backup projects, local DB files, and crash logs.
7. Do not publish secrets, `.env`, APK artifacts, local SQLite databases, crash logs, or `node_modules`.
8. Backend port requested for final local target is `8080`. Metro is normally `8081`.
9. Physical phone testing is a separate gate from build/test success.
10. For OMR, preserve the approved layout and compare generator, manifest, and mobile parser before changing geometry.

## 3. High-level completion status

This is the honest state as of this handoff.

| Area | Current state | Done enough for demo? | Still needed |
| --- | --- | --- | --- |
| V1 mobile flow | Existing active legacy mobile flow. | Partly yes, for old flow. | Preserve. Do not regress. |
| V2 mobile fixed OMR | Fixed 10-item A4 multiple-choice scanner and local sync model exist. | Partly yes, if using fixed template. | Keep separate from V3 dynamic work. |
| V3 auth on mobile | Login, MFA challenge/verify, `/me`, secure Android session persistence, expiry/401 handling are implemented in source. | Needs focused device confirmation per APK. | Keep testing login -> force-stop -> relaunch -> `/me` restore. |
| V3 mobile download | Reference data, full snapshot, answer-sheet manifest download, local save, diagnostics screen exist. | Partly yes. | Verify against the exact backend and selected account. |
| V3 dynamic scanner | Android native dynamic scanner and bundled A4/Letter/Legal manifests exist. | Prototype only. | Physical acceptance with backend-generated sheets and upload chain. |
| V3 upload/finalize | Backend source has scan page, detection, verification, readback, correction, reopen, supersede endpoints. Mobile has objective client/service pieces. | Not fully accepted. | Full phone-backend-web acceptance run. |
| Web dashboard | React/Vite app has auth, teacher/principal pages, V2 pages, V3 reports/setup/security-related components. | Partly yes. | Compare mobile uploaded result against web reports. |
| Backend V3 | Spring Boot source contains V3 auth, MFA, assessment, mobile, scoring, reports, schedules, SF1, system readiness. | Source is broad. | Run current backend checks and E2E acceptance before claiming complete. |

Estimated maturity, not a formal percentage:

- Backend V3 source coverage is broad, but acceptance must still verify exact running behavior.
- Mobile V1/V2 are established; Mobile V3 is in active integration.
- Frontend has many screens/routes; final result consistency with Mobile V3 is the remaining important proof.

## 4. Active repositories and folders

### 4.1 Mobile - `D:\ThesisProjects\MobileAssessmentApp`

This is the active React Native workspace. Current active entry is:

- `index.js` registers `App` from `./App`.
- `App.tsx` is the main runtime shell and still contains a lot of app state and flow logic.
- Android starts through `android/app/src/main/java/com/mobileassessmentapp/MainActivity.kt` and `MainApplication.kt`.

Important top-level folders:

- `src/` - TypeScript/JavaScript app code.
- `android/` - native Android project, Kotlin bridge modules, manifests, resources, Gradle config.
- `ios/` - React Native iOS template/project; not the focus of current device work.
- `__tests__/` - Jest/unit/component tests for V3 contracts, repositories, scanner, session service, diagnostics.
- `docs/` - mobile documentation and handoffs.
- `assets/` - app image assets such as launcher logo.
- `scripts/` - helper scripts, currently including SQLite Android patching.
- `artifacts/` - generated APKs and local output; should be ignored, not committed.
- `.vscode/` - local editor settings; should be ignored.
- `MobileAssessmentApp/` and `old_MobileAssessmentApp/` - inactive duplicate/backup folders; do not treat as active runtime.

### 4.2 Backend - `D:\CAPSTONE_2\backend\assessment`

Spring Boot backend. Important source root:

- `src/main/java/com/capstone/assessment`

Major backend domains seen in source:

- `auth` - older auth.
- `sync` - legacy sync endpoints.
- `v2/*` - V2 auth, assessment, analytics, school setup, SF1, OMR print support.
- `v3/auth` - V3 login, teacher registration, MFA, `/me`, logout, token/security.
- `v3/assessment` - V3 assessment creation and lifecycle.
- `v3/answersheet` - V3 dynamic answer-sheet generation/layout.
- `v3/mobile` - mobile download, manifest, upload, detection, verification, finalization, readback, corrections.
- `v3/report` - reports.
- `v3/scoring` - official scoring.
- `v3/schedule` - class schedules.
- `v3/school` - academic calendar, teacher roster, school setup.
- `v3/system` - baseline/readiness and mobile release checks.

Backend stack:

- Java 17
- Spring Boot 3.5.16
- Spring Web
- Spring Security
- Spring Validation
- Spring Data JPA is present, but much of the project uses explicit SQL/repository style.
- MySQL connector runtime
- PDFBox 3.0.5
- ZXing JavaSE 3.5.3
- Apache POI 5.4.1

### 4.3 Web Dashboard - `D:\CAPSTONE_2\web-dashboard`

React/Vite dashboard. Important source root:

- `src/`

Frontend stack:

- Vite 8.0.12
- React 19.2.6
- React DOM 19.2.6
- Tailwind CSS 4.3.3
- Radix UI components
- lucide-react
- Recharts
- React Datepicker

Important folders/files:

- `src/api/apiClient.js` - base/legacy API client.
- `src/api/apiV2Client.js` - V2 API client.
- `src/api/apiV3Client.js` - V3 API client.
- `src/App.jsx` - main app routing shell.
- `src/components/AppLayout.jsx` - authenticated layout shell.
- `src/components/MfaSecurityPanel.jsx` - MFA/security UI.
- `src/components/NotificationCenter.jsx` - notifications.
- `src/components/V2Sf1ImportPanel.jsx` and `V3Sf1ImportPanel.jsx` - SF1 import UI by version.
- `src/pages/*` - main teacher/principal/report/settings pages.
- `src/v2/*` - V2-specific app shell, login, assessment editor/list, OMR print page, routes, session.
- `src/styles/*` - global, auth, reports, system, security, V2 modal styles.

## 5. Mobile technology details

Mobile is a React Native app, not a pure Kotlin app. GitHub may show a large Kotlin percentage because Android native scanner/session modules are large.

Mobile stack from `package.json` and Gradle:

- React Native 0.83.1
- React 19.2.0
- TypeScript 5.8.3
- Jest 29.6.3
- react-native-quick-sqlite 8.2.7
- react-native-safe-area-context 5.6.2
- react-native-svg 15.15.5
- lucide-react-native 1.18.0
- sha.js 2.4.12
- Android compile SDK 36
- Android target SDK 36
- Android min SDK 24
- Kotlin 2.1.20
- NDK 27.1.12297006
- OpenCV Android dependency `org.opencv:opencv:4.13.0`
- ZXing Android/core dependency `com.google.zxing:core:3.5.4`
- Android applicationId `com.mobileassessmentapp`
- Debug/release currently use debug signing in `android/app/build.gradle`

Android permissions and providers:

- `INTERNET`
- camera/image capture intent query
- image document picker query
- FileProvider using `android/app/src/main/res/xml/omr_file_paths.xml`
- network security config through `android/app/src/main/res/xml/network_security_config.xml`

## 6. Backend URLs and local staging behavior

Mobile API config lives in `src/config/api.ts`.

Known values:

- Cloud backend: `https://performance-analytics-assessment-system.onrender.com`
- Physical debug device base URL: `http://localhost:8080`
- Android emulator base URL: `http://10.0.2.2:8080`
- Device target mode: `auto`

Meaning:

- In debug, emulator uses `10.0.2.2:8080`.
- In debug, physical device uses `localhost:8080` through `adb reverse tcp:8080 tcp:8080`.
- In release, mobile should not depend on ADB/local backend and should resolve to cloud.

Metro normally runs on `8081`. A physical debug device also needs `adb reverse tcp:8081 tcp:8081` for Metro.

## 7. V1, V2, and V3 mobile database boundaries

### 7.1 V1 local database

Files:

- `src/database/db.js`
- `src/database/schema.js`
- `src/database/syncService.ts`

Database name:

- `AssessmentStorage.db`

Schema file declares 11 tables:

- `users`
- `classes`
- `students`
- `student_enrollments`
- `tests`
- `test_parts`
- `competencies`
- `test_results`
- `item_responses`
- `class_sync_metadata`
- `session_metadata`

Role:

- Legacy mobile local data.
- Download/upload paths are `/api/sync/download/{teacherId}` and `/api/sync/upload`.
- Uses older integer IDs and legacy sync shape.
- Must be preserved.

### 7.2 V2 local database

Files:

- `src/database/v2/schema.ts`
- `src/database/v2/database.ts`
- `src/database/v2/downloadRepository.ts`
- `src/database/v2/resultRepository.ts`
- `src/database/v2/syncRepository.ts`
- `src/database/v2/analyticsRepository.ts`
- `src/database/v2/contextRepository.ts`
- `src/database/v2/contracts.ts`
- `src/database/v2/uuid.ts`

Database:

- V2 schema version is `1`.
- Declares 20 tables and 9 indexes in source.

Important V2 tables:

- `schema_versions`
- `users`
- `classes`
- `class_assignments`
- `students`
- `class_lists`
- `tests`
- `test_parts`
- `questions`
- `answer_keys`
- `skills`
- `question_mappings`
- `download_snapshots`
- `scan_sessions`
- `omr_detections`
- `test_results`
- `test_result_scans`
- `student_answers`
- `sync_batches`
- `sync_result_items`

Role:

- Offline fixed-template OMR workflow.
- Result identity and sync are more disciplined than V1.
- Still separate from V3.

### 7.3 V3 local database

Files:

- `src/database/v3/schema.ts`
- `src/database/v3/database.ts`
- `src/database/v3/downloadRepository.ts`
- `src/database/v3/manifestRepository.ts`
- `src/database/v3/referenceDataRepository.ts`
- `src/database/v3/diagnosticRepository.ts`
- `src/database/v3/objectiveRepository.ts`
- `src/database/v3/parsers.ts`
- `src/database/v3/contracts.ts`
- `src/database/v3/integrity.ts`
- `src/database/v3/sqlite.ts`
- `src/database/v3/migrationPlan.ts`

Database name:

- `AssessmentStorageV3.db`

Current source facts:

- `V3_DRAFT_SCHEMA_VERSION = 4`
- `V3_CONTRACT_VERSION = 3.0`
- central baseline migration label is `V3_014_academic_calendar_and_class_schedules`
- configured central baseline says 67 tables, 163 foreign keys, 87 checks, 99 unique constraints
- local V3 source declares 40 tables, 21 indexes, and 12 triggers

Important V3 shared tables:

- `users`
- `classes`
- `class_assignments`
- `class_assignment_schedules`
- `students`
- `class_lists`
- `term_periods`
- `question_types`
- `paper_sizes`
- `omr_templates`
- `omr_template_regions`
- `tests`
- `test_assignments`
- `test_parts`
- `questions`
- `question_options`
- `skills`
- `part_skill_mappings`
- `answer_sheet_versions`
- `answer_sheet_pages`
- `answer_sheet_regions`
- `answer_sheet_region_options`

Important V3 mobile-only tables:

- `schema_versions`
- `reference_data_state`
- `download_snapshots`
- `download_snapshot_entities`
- `download_snapshot_rows`
- `test_results`
- `scan_sessions`
- `scan_pages`
- `omr_detections`
- `scan_verifications`
- `test_result_scans`
- `student_answers`
- `answer_attachments`
- `answer_verifications`
- `answer_rubric_scores`
- `syncs`
- `sync_items`
- `objective_outbox`

Role:

- V3 is designed for immutable scan evidence, answer-sheet manifests, page/region identity, teacher verification, retry-safe sync, and backend official scoring.
- It is intentionally parallel and isolated.
- `src/database/v3/migrationPlan.ts` explicitly says production SQLite migration, endpoint switching, and V2 result carryover are not authorized.

## 8. Authentication and secure session state

Mobile V3 auth files:

- `src/services/v3/authClient.ts`
- `src/services/v3/secureSessionService.ts`
- `src/native/v3SecureSession.ts`
- `android/app/src/main/java/com/mobileassessmentapp/V3SecureSessionModule.kt`
- `android/app/src/main/java/com/mobileassessmentapp/V3SecureSessionPackage.kt`

Backend V3 auth routes include:

- `POST /api/v3/auth/login`
- `GET /api/v3/auth/me`
- `POST /api/v3/auth/logout`
- `POST /api/v3/auth/mfa/login/verify`
- MFA status, enrollment, confirm, recovery-code regeneration, disable

Mobile behavior:

- Login can return either authenticated session or MFA required.
- MFA supports `authenticator` and `recovery_code`.
- Session requires Bearer token, `accessToken`, `expiresAt`, and teacher user identity.
- Secure session restoration calls `/api/v3/auth/me`.
- Expired session is cleared and requires login.
- HTTP 401 clears the saved session and requires login.
- Android secure storage uses Android Keystore AES/GCM/NoPadding and SharedPreferences ciphertext.

Important acceptance flow:

1. Login with the real teacher account.
2. Complete authenticator MFA when enabled.
3. Download V3 data.
4. Force-stop the app.
5. Relaunch.
6. Confirm secure session is restored and verified by `/me`.
7. Expire or invalidate token and verify reauthentication behavior.

## 9. OMR scanner and answer-sheet versions

### 9.1 Fixed V2 scanner

Files:

- `android/app/src/main/java/com/mobileassessmentapp/OmrDetector.kt`
- `android/app/src/main/assets/omr/omr_mc_10_context_v2.json`
- `src/native/omrScanner.ts`
- `src/components/OmrScannerModal.tsx`

Fixed template facts:

- Template code/version: `OMR-A4-10-MC-CTX-V2`
- Paper: A4
- Width: 595.276 pt
- Height: 841.89 pt
- Pages: 1
- Items: 10
- Question type: multiple choice
- Scanner version: `3.0.0`
- Uses OpenCV QR detector and OpenCV image processing
- Uses four corner markers and bubble darkness thresholds

Important limitation:

- This scanner supports exactly 10 items. It should not be used as proof that 1-5 or 1-7 V3 dynamic tests are scan-ready.

### 9.2 Dynamic V3 scanner

Files:

- `android/app/src/main/java/com/mobileassessmentapp/DynamicOmrDetector.kt`
- `src/native/dynamicOmrScanner.ts`
- `src/prototypes/v3DynamicOmrScanner/DynamicOmrScannerPrototype.tsx`
- `android/app/src/main/assets/omr/dynamic/v3_dynamic_mixed_a4_manifest.json`
- `android/app/src/main/assets/omr/dynamic/v3_dynamic_mixed_us_letter_manifest.json`
- `android/app/src/main/assets/omr/dynamic/v3_dynamic_mixed_us_legal_manifest.json`

Dynamic scanner facts:

- Dynamic Android scanner version: `3.0.0-prototype.2-android-test.2`
- Required manifest scanner version: `3.0.0-prototype.2`
- Design system code: `SMART-DYNAMIC-ANSWER-SHEET`
- Manifest version expected by mobile prototype: `2`
- Uses ZXing first for QR decode, then OpenCV QR fallback.
- ZXing hints include QR only, `TRY_HARDER`, inverted decode, and UTF-8.
- Uses OpenCV for image decode, quality checks, alignment, marker checks, warping, region cropping, and mark analysis.
- Alignment method is four corner markers.
- Dynamic QR payload version is `3`.
- QR payload must contain the nine approved fields.

Bundled dynamic manifest summary:

| File | Template code | Paper | Size | Pages | Questions | QR payload |
| --- | --- | --- | --- | --- | --- | --- |
| `v3_dynamic_mixed_a4_manifest.json` | `OMR-A4-DYNAMIC-CTX-V3` | A4 | 595.276 x 841.89 pt | 2 | 12 | v3 |
| `v3_dynamic_mixed_us_letter_manifest.json` | `OMR-US-LETTER-DYNAMIC-CTX-V3` | US Letter | 612 x 792 pt | 2 | 12 | v3 |
| `v3_dynamic_mixed_us_legal_manifest.json` | `OMR-US-LEGAL-DYNAMIC-CTX-V3` | US Legal | 612 x 1008 pt | 2 | 12 | v3 |

Important clarification:

- `OMR-A4-DYNAMIC-CTX-V3` is a template code inside the manifest and QR payload. It is not the filename.
- The filename is `android/app/src/main/assets/omr/dynamic/v3_dynamic_mixed_a4_manifest.json`.
- The old fixed file `omr_mc_10_context_v2.json` is for `OMR-A4-10-MC-CTX-V2`.

### 9.3 Backend dynamic layout

Backend file:

- `D:\CAPSTONE_2\backend\assessment\src\main\java\com\capstone\assessment\v3\answersheet\service\V3DynamicLayout.java`

Current backend dynamic A4 layout facts:

- Code: `OMR-A4-DYNAMIC-CTX-V3`
- Version: `3`
- Scanner version: `3.0.0`
- Manifest version: `2`
- Max pages: 12
- Width/height: 595.276 x 841.890 pt
- Dynamic supports 5 to `MAX_QUESTIONS`, where max is derived from page capacity and 12 pages.
- QR payload must stay under 256 bytes.

Important item-count distinction:

- Backend assessment creation/activation can accept an assessment with at least 1 question.
- Dynamic A4 mobile capture starts at 5 questions.
- Fixed V2 capture is exactly 10 questions.
- If the user wants 1-5 minimum, clarify whether that means assessment creation minimum or scannable dynamic sheet minimum. Current dynamic sheet logic starts at 5, so a 1-4 item test may need non-scan/manual mode or a new approved layout rule.

## 10. V3 mobile API contract

Mobile read client:

- `src/services/v3/mobileReadClient.ts`

Implemented read paths in mobile contract:

- `GET /api/v3/mobile/reference-data`
- `GET /api/v3/mobile/download`
- `GET /api/v3/mobile/test-assignments/{assignmentUuid}/answer-sheets/{answerSheetUuid}/manifest`

V3 contract/parser files:

- `src/database/v3/contracts.ts`
- `src/database/v3/parsers.ts`

Important parsed fields:

- `classStatus`
- `classAssignmentSchedules`
- answer-sheet identities
- manifest hash
- paper size
- QR payload
- page/region/option coordinate data

V3 objective upload client:

- `src/services/v3/objectiveClient.ts`
- `src/services/v3/objectiveSyncService.ts`
- `src/database/v3/objectiveRepository.ts`

Mobile upload/readback paths referenced in source:

- `POST /api/v3/mobile/scan-pages`
- `POST /api/v3/mobile/scan-pages/{scanPageUuid}/detections`
- `POST /api/v3/mobile/verification-batches`
- `GET /api/v3/mobile/results/{resultUuid}`
- `POST /api/v3/mobile/results/{resultUuid}/finalize`
- `GET /api/v3/mobile/results/{resultUuid}/analytics`

Backend current source also has:

- attachments upload
- evaluation reference
- result correction
- result reopen
- result supersede
- readback for syncs

Do not claim the whole upload/finalize/readback flow is accepted until tested on the phone with backend and web report comparison.

## 11. Mobile folder and file map

### `App.tsx`

Large main app runtime. It coordinates:

- app screens and selected class/test/student state
- V1/V2/V3 downloaded data presentation
- login/download actions
- V2 and V3 storage distinctions through `storage_version`
- V3 diagnostics launch
- V3 objective workflow modal
- sync status messaging
- local roster/test stats reload

Because it is large, new AI should avoid broad refactors. Patch narrow behavior only.

### `src/components/`

- `AnalyticsView.tsx` - local analytics display.
- `CheckingGrid.tsx` - V1 checking grid.
- `DashboardHeader.tsx` - dashboard header.
- `LoginScreen.tsx` - login UI.
- `NavigationLists.tsx` - class/test list rendering, including V2/V3 labels.
- `OmrScannerModal.tsx` - fixed OMR scanner review modal.
- `StudentList.tsx` - student list/search.
- `V3ObjectiveWorkflowModal.tsx` - V3 objective scan/verify/send workflow surface.

### `src/services/`

- `authService.ts` - legacy/V1 auth service.
- `v2SyncService.ts` - V2 sync/download/upload service.
- `v3/authClient.ts` - V3 login, MFA, `/me`, logout.
- `v3/diagnosticsConnection.ts` - V3 diagnostics connection helper.
- `v3/mobileReadClient.ts` - V3 reference/download/manifest client.
- `v3/objectiveClient.ts` - V3 scan/detection/verification/finalize/readback client.
- `v3/objectiveSyncService.ts` - sync orchestration around objective workflow.
- `v3/offlineDataService.ts` - downloads reference data, snapshot, and manifests.
- `v3/secureSessionService.ts` - secure persistence, `/me` restoration, expiry/401 handling.

### `src/native/`

- `omrScanner.ts` - JS/TS bridge to fixed Android scanner.
- `dynamicOmrScanner.ts` - JS/TS bridge to dynamic Android scanner.
- `v3SecureSession.ts` - JS/TS bridge to Android secure session module.

### `src/prototypes/`

- `v3DynamicOmrScanner/DynamicOmrScannerPrototype.tsx` - local prototype UI for dynamic scanner.
- `v3OfflineDiagnostics/V3OfflineDiagnosticsScreen.tsx` - V3 diagnostics and download screen.
- `v3WrittenResponseReview/*` - prototype for written response review; not full production upload.

### `android/app/src/main/java/com/mobileassessmentapp/`

- `MainActivity.kt` - Android main activity.
- `MainApplication.kt` - registers packages.
- `OmrDetector.kt` - fixed V2 A4 10-item scanner.
- `DynamicOmrDetector.kt` - dynamic V3 manifest-based scanner.
- `OmrScannerModule.kt` - React Native bridge for scanner functions.
- `OmrScannerPackage.kt` - package registration for scanner module.
- `V3SecureSessionModule.kt` - Android Keystore encrypted session store.
- `V3SecureSessionPackage.kt` - package registration for secure session module.

### `android/app/src/main/assets/omr/`

- `omr_mc_10_context_v2.json` - fixed V2 A4 10 MC template.
- `dynamic/v3_dynamic_mixed_a4_manifest.json` - V3 A4 dynamic manifest.
- `dynamic/v3_dynamic_mixed_us_letter_manifest.json` - V3 US Letter dynamic manifest.
- `dynamic/v3_dynamic_mixed_us_legal_manifest.json` - V3 US Legal dynamic manifest.

### `__tests__/`

Important tests include:

- `dynamicOmrScanner.test.ts`
- `v3AuthClient.test.ts`
- `v3Contracts.test.ts`
- `v3DiagnosticRepository.test.ts`
- `v3Integrity.test.ts`
- `v3MobileReadClient.test.ts`
- `v3ObjectiveClient.test.ts`
- `v3ObjectiveSyncService.test.ts`
- `v3OfflineDataService.test.ts`
- `v3OfflineDiagnosticsScreen.test.tsx`
- `v3OfflineRepositories.test.ts`
- `v3SchemaDraft.test.ts`
- `v3SecureSessionService.test.ts`
- `v3WrittenResponseReview*.test.*`

Fixtures:

- `__tests__/fixtures/v3/mobile/reference-data-response.json`
- `__tests__/fixtures/v3/mobile/download-response.json`
- `__tests__/fixtures/v3/mobile/answer-sheet-manifest-response.json`

## 12. Current acceptance workflow expected by the team

The important final acceptance run is not just login or diagnostics. It is:

1. Login on Mobile.
2. Complete MFA when enabled.
3. Download the assigned assessment, students, and manifest.
4. Confirm local SQLite contains the expected classes, students, assessments, questions, and answer-sheet pages/regions.
5. Turn off internet or simulate offline if needed.
6. Scan a supported answer sheet.
7. Save scan evidence and detections locally.
8. Teacher reviews and confirms/corrects answers.
9. Reconnect.
10. Upload/retry without duplicates or data loss.
11. Finalize verified result.
12. Backend computes official score.
13. Open Mobile result and Web Reports.
14. Confirm same student, assessment, score, status, and analytics.

The example acceptance expectation is: if official score is 8/10 and 80 percent, Mobile and Web Reports must both show the same result and report must not be empty.

## 13. Known not-finished / risky areas

1. Dynamic scanner physical acceptance remains the biggest risk. QR decode, marker alignment, lighting, paper print scale, and backend-generated geometry must be tested together.
2. V3 Mobile upload/finalization must be proven with the backend currently running, not only source code.
3. Web Reports must be compared against backend official scoring after mobile upload.
4. V3 cutover is not authorized. Keep V1/V2 alive.
5. Local mobile unsynced data must be preserved.
6. Backend/mobile dynamic template naming must stay aligned:
   - fixed V2: `OMR-A4-10-MC-CTX-V2`
   - dynamic V3 A4: `OMR-A4-DYNAMIC-CTX-V3`
7. Do not mix A4/US Letter/US Legal geometry. Each paper size has separate immutable geometry.
8. Do not assume the cloud backend and local backend contain the same state.
9. Do not use old handoff docs as runtime truth when source has changed.
10. GitHub language percentages may show Kotlin/Ruby/Swift because native Android and template files are large. The app is still React Native.

## 14. What the next AI should do first

When starting a new chat/session:

1. Confirm which side is being worked on: backend, frontend, mobile, or cross-stack.
2. Confirm active path.
3. Run a read-only scan:
   - `git status --short`
   - relevant package/build config
   - active entry points
   - target files only
4. Confirm running ports and device state if mobile testing is requested.
5. Do not change ports or restart backend unless asked.
6. If mobile install is needed, verify signing/application ID compatibility before replacing APK.
7. Never uninstall or clear app storage just to bypass an install conflict.
8. For OMR/backend alignment, compare manifest/generator/parser first.
9. For V3 result claims, require evidence from phone, backend, and web report.

## 15. Suggested near-term roadmap

### M1 - Secure V3 mobile session and download baseline

Status: mostly implemented in source; needs focused device confirmation.

Acceptance:

- Login with MFA.
- Download V3 snapshot and manifests.
- Force-stop/relaunch.
- Restore with `/me`.
- Handle expiry/401 by requiring re-login.
- Preserve local downloaded data.

### M2 - V3 scan page capture and upload chain

Status: source pieces exist on both sides; end-to-end acceptance still required.

Acceptance:

- Scan supported V3 dynamic page.
- Save original image hash and page identity.
- Upload scan page multipart.
- Upload detections.
- Teacher verifies.
- Backend accepts idempotent operations.

### M3 - Finalization, official score, and readback

Status: backend source includes finalization/readback/scoring pieces; full cross-stack proof pending.

Acceptance:

- Mobile finalizes result.
- Backend computes official score.
- Mobile reads official result.
- Web Reports show the same result.

### M4 - Production cutover

Status: not authorized.

Acceptance:

- V1/V2 preservation plan.
- Migration/rollback plan.
- Device validation.
- Backend staging validation.
- Web report validation.
- Explicit user approval.

## 16. One-paragraph explanation for another AI

This project is a SMART Performance Analytic Assessment System with a Spring Boot backend, React/Vite web dashboard, and React Native mobile teacher app. The mobile app currently preserves V1/V2 workflows while integrating isolated V3 features for secure auth, offline download, SQLite storage, OMR scanning, teacher verification, and sync. V3 is not a simple replacement; it introduces immutable answer-sheet manifests, scan evidence, page/region identities, and backend official scoring. The key rule is to verify the active source and runtime before changing anything, because several folders and docs are historical. The main unfinished work is proving the full phone-to-backend-to-web loop: login with MFA, download, scan, verify, upload/retry, finalize, official score, and matching Web Reports.

## 17. Message to paste to any new AI

You are taking over the SMART Performance Analytic Assessment System. Work carefully across Backend, Frontend, and Mobile. The active mobile repo is `D:\ThesisProjects\MobileAssessmentApp`; backend is `D:\CAPSTONE_2\backend\assessment`; web dashboard is `D:\CAPSTONE_2\web-dashboard`; OMR prototype references are in `D:\ThesisProjects\OMRPrototype`. Start read-only: inspect paths, status, entry points, package/build files, and the exact files involved. Preserve V1/V2, mobile SQLite, unsynced data, old backups, and current dirty work. Do not delete, reset, clean, uninstall, clear storage, change ports, or restart backend without explicit instruction. React Native mobile uses TypeScript plus Android Kotlin native modules for OMR and secure session. OpenCV is `4.13.0`; ZXing core is `3.5.4`; backend ZXing JavaSE is `3.5.3`. Fixed V2 OMR is `OMR-A4-10-MC-CTX-V2`, A4, 10 multiple-choice items. Dynamic V3 A4 template code is `OMR-A4-DYNAMIC-CTX-V3`; it appears inside the V3 manifest/QR, with file `android/app/src/main/assets/omr/dynamic/v3_dynamic_mixed_a4_manifest.json`. V3 also has US Letter and US Legal dynamic manifest files. Do not confuse template code with filename. The target acceptance workflow is Mobile login with MFA -> download -> offline scan -> teacher verification -> upload/retry -> finalize -> backend official score -> Mobile/Web Reports match. Do not claim done until that is tested.
