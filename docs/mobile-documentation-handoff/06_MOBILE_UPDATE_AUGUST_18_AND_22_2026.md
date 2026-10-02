# Mobile Technical Update: August 18 and August 22, 2026

Document snapshot: August 22, 2026

Purpose: Record the August 18 phone-side OMR source work and the August 22
mobile/backend compatibility audit without presenting pending V2 behavior as
deployed.

Update note: the later focused work recorded in
`07_MOBILE_V2_DOWNLOAD_SLICE_AUGUST_22_2026.md` supersedes this audit only for
V2 download wiring. V2 download is now source-integrated and type-checked, but
its device/backend runtime test and all V2 upload work remain pending.

## Status Labels

- IMPLEMENTED IN CURRENT V1: present in the manual-checking application and
  connected to the V1 API path.
- IMPLEMENTED IN ISOLATED MOBILE V2 SOURCE: present in source, but separated
  from V1 production data and not connected to V2 synchronization.
- SOURCE-CONFIRMED, RUNTIME NEEDS CONFIRMATION: implementation can be inspected,
  but a fresh device test was not performed for this documentation update.
- PENDING: contract or scaffold exists, but the complete runtime path does not.

## August 18, 2026: Phone-Side OMR Source Integration

### What was added in source

The August 18 source files show a partial phone-side implementation for the
approved ten-item Multiple Choice OMR template:

- Android-native OpenCV detector through `org.opencv:opencv:4.13.0`.
- React Native native-module bridge named `OmrScanner`.
- Camera capture and gallery/photo selection entry points.
- Fixed template map stored in Android assets.
- Four-marker page alignment and fixed-coordinate bubble measurement.
- QR/template validation for template version, question type, item count, and
  selected test ID when the QR contains a test ID.
- Detection output containing option, confidence, status, marked options, raw
  option scores, image hash, and timestamps.
- Teacher review UI for confirming or correcting every detected item.
- A guard that prevents an unreviewed scan from being saved as verified.
- Isolated V2 result persistence for scan sessions, raw detections, results,
  result-scan links, and final student answers when downloaded V2 context is
  available.

### Current supported phone-scanner scope

- Template: `OMR-A4-10-MC-CTX-V2`.
- Question type: ten-item Multiple Choice only.
- Options: A, B, C, and D.
- Sources: camera or an existing image chosen from the device.
- Review: every item must be reviewed before completion.

True or False is not implemented by the current Android detector. Earlier
template planning must not be used as evidence that phone-side True or False
scanning is working.

### Safety boundary

The August 18 implementation does not silently write OMR results into V1
SQLite. The scanner first tries to resolve the selected test and student to
authoritative V2 `classListId` and `questionId` values. If that V2 download
context is missing, the teacher may finish the prototype review, but the result
is not written to V1 SQLite or V1 sync.

### Verification status

Status: SOURCE-CONFIRMED, RUNTIME NEEDS CONFIRMATION.

The source integration exists, but this documentation update did not run a
fresh Android build, camera test, isolated V2 save test, or backend upload.
Therefore, August 18 must be recorded as mobile OMR source integration and not
as completed production OMR deployment.

## August 22, 2026: V1/V2 Connectivity and Schema Audit

### Current V1 connectivity

Status: IMPLEMENTED IN CURRENT V1.

The visible application actions still use the V1 synchronization flow:

- Download: `GET /api/sync/download/{teacherId}`.
- Upload: `POST /api/sync/upload`.
- Development Android emulator target: `http://10.0.2.2:8081`.
- Standalone/release or physical-phone automatic target: deployed Render cloud
  backend.
- A manual physical-device local-network target remains configurable.

The V1 upload payload contains teacher/test identity, upload timestamp, test
results, raw answers, total and maximum score, checked time, and item responses.
This is the current manual-checking synchronization path.

### Isolated V2 SQLite contents

Status: IMPLEMENTED IN ISOLATED MOBILE V2 SOURCE.

The separate database is `AssessmentStorageV2.db`. It defines 20 local tables:

1. `schema_versions`
2. `users`
3. `classes`
4. `class_assignments`
5. `students`
6. `class_lists`
7. `tests`
8. `test_parts`
9. `questions`
10. `answer_keys`
11. `skills`
12. `question_mappings`
13. `download_snapshots`
14. `scan_sessions`
15. `omr_detections`
16. `test_results`
17. `test_result_scans`
18. `student_answers`
19. `sync_batches`
20. `sync_result_items`

The schema preserves stable `scan_uuid`, `result_uuid`, `answer_uuid`, and
`sync_uuid` values. It separates raw OMR evidence from teacher-verified
answers and includes local retry fields such as `is_synced`, attempt count,
last error, and last synchronization time.

### V2 backend compatibility verdict

Status: DESIGN-ALIGNED, END-TO-END PENDING.

The local V2 schema and TypeScript contracts are structurally aligned with the
partial V2 backend SQL and contract in the following areas:

- authoritative `classListId` and `questionId` identities;
- scan, detection, verification, answer, and synchronization statuses;
- stable UUID-based retry and idempotency rules;
- raw detections kept separately from final verified student answers;
- one batch per test and per-result create/update actions; and
- backend-authoritative scoring from verified answers.

Physical table names do not need to be identical. For example, mobile uses
`sync_batches` and `sync_result_items`, while the central design uses `syncs`
and `sync_items`. The API mapping is the compatibility boundary.

### Missing V2 runtime connection

Status: PENDING.

The mobile source does not currently call either of these endpoints:

- `GET /api/v2/sync/download`
- `POST /api/v2/sync/upload`

`saveV2DownloadPayload()` exists, but no application or service caller was
found. V2 upload DTOs exist, but no V2 network service builds, sends, or handles
the upload response. As a result:

- V1 manual checking can download and upload now.
- The phone OMR path cannot yet download its V2 context from the backend.
- The phone OMR path cannot yet upload verified V2 results to the backend.
- V2 schema compatibility is not an end-to-end runtime confirmation.

## Compatibility Matrix

| Capability | August 22 status | Meaning |
| --- | --- | --- |
| V1 manual download | Implemented | Current V1 endpoint is called by the app |
| V1 manual upload | Implemented | Current V1 results are posted and marked synced after success |
| Native phone OMR source | Source-confirmed | Camera/gallery, detector, review UI, and bridge exist |
| Phone OMR runtime validation | Needs confirmation | Fresh build/device scan was not run for this update |
| Isolated V2 SQLite schema | Implemented in source | Separate database and tables are defined and initialized |
| V2 local OMR save | Conditional | Requires downloaded V2 test/student/question context |
| V2 backend download | Pending | Repository exists, but no network call/caller is wired |
| V2 backend upload | Pending | DTOs exist, but no V2 upload service is wired |
| Backend scoring of mobile V2 answers | Pending | Cannot be claimed until V2 upload runtime is available and tested |
| End-to-end OMR analytics | Pending | Requires download, scan, verify, save, upload, score, and web validation |

## Required Next Validation After Contract Approval

1. Wire and test `GET /api/v2/sync/download` without changing V1 behavior.
2. Confirm the response persists into `AssessmentStorageV2.db` without
   duplicate IDs.
3. Build the V2 upload payload from verified unsynced results.
4. Wire and test `POST /api/v2/sync/upload` with partial-success handling.
5. Retry using the same UUIDs and verify that no central duplicate is created.
6. Run a physical-phone camera scan and teacher review using downloaded V2
   context.
7. Confirm the backend calculates the authoritative score and the web reads the
   verified answers.

## Evidence

- `App.tsx`: V1 download/upload actions, V2 initialization, and scanner modal.
- `src/config/api.ts`: emulator, physical-device, and cloud target selection.
- `src/database/db.js`: V1 download and local persistence.
- `src/database/syncService.ts`: V1 upload payload and response handling.
- `src/database/v2/contracts.ts`: V2 status values and API DTO design.
- `src/database/v2/schema.ts`: 20-table isolated V2 SQLite design.
- `src/database/v2/database.ts`: separate V2 database initialization.
- `src/database/v2/downloadRepository.ts`: local V2 download persistence helper.
- `src/database/v2/resultRepository.ts`: V2 context guard and verified OMR save.
- `src/components/OmrScannerModal.tsx`: capture, review, correction, and save UI.
- `src/native/omrScanner.ts`: React Native-to-Android scanner wrapper.
- `android/app/src/main/java/com/mobileassessmentapp/OmrScannerModule.kt`:
  camera/gallery native bridge.
- `android/app/src/main/java/com/mobileassessmentapp/OmrDetector.kt`:
  Android OpenCV alignment, QR validation, and mark detection.
- `android/app/src/main/assets/omr/omr_mc_10_context_v2.json`: fixed scanner map.
- `android/app/build.gradle`: Android OpenCV dependency.

## Safe Documentation Statement

> As of August 22, 2026, the current V1 React Native application remains the
> working manual offline-checking and synchronization implementation. On
> August 18, Android-native fixed-template Multiple Choice OMR source was added
> with camera/gallery input, OpenCV detection, teacher review, and isolated V2
> persistence guards. However, the V2 download and upload APIs are not yet
> connected from mobile, and the phone OMR path has not been verified
> end-to-end with backend scoring and web analytics. It must therefore be
> described as partial mobile V2 integration, not a deployed production flow.
