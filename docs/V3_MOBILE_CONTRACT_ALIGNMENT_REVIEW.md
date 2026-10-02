# V3 Mobile Contract Alignment Review

Status date: 2026-09-07

Scope: Mobile-side review only. This document aligns the current Mobile V2
SQLite/API direction with the completed backend V3 read-only mobile contract.
It does not authorize production SQLite migration, endpoint switching, scan-page
upload, or dynamic template activation.

## September 7 Central Export Reconciliation

The attached `performance_assessment_v3_db.sql` export is now the primary central
schema reference. Backend migration and validation records confirm that it is the
`V3_014_academic_calendar_and_class_schedules` baseline: 67 tables, 163 foreign
keys, 87 checks, and 99 unique constraints. These totals supersede the handoff's
older 66/158/80/96 readiness block.

`class_assignment_schedules` is the table added after the 66-table V3_013
baseline. The isolated Mobile schema reserves the read-only lookup fields needed
for future availability display, but the implemented download DTO does not
provide this collection yet. Mobile must not infer schedules from other fields.

The export also confirms that the dynamic answer-sheet, scan-page, attachment,
and rubric-score tables currently have no exported rows. Their existence proves
schema readiness only, not generator, upload, scoring, or physical scanner
readiness.

## Reviewed Backend Contract

Authoritative backend contract:

- `D:\CAPSTONE_2\backend\assessment\docs\V3_MOBILE_API_CONTRACT.md`

Implemented V3 mobile endpoints on port `8082`:

- `GET /api/v3/mobile/reference-data`
- `GET /api/v3/mobile/download`
- `GET /api/v3/mobile/test-assignments/{assignmentUuid}/answer-sheets/{answerSheetUuid}/manifest`

All implemented endpoints require:

```http
Authorization: Bearer <v3-session-token>
```

The backend confirms teacher identity, school ownership, role, and active account
state from the token. Mobile must not send or trust user/school identity as an
override.

## Verdict

Mobile may continue isolated V3 DTO and SQLite migration design against this
contract and the September 7 central export. The parallel draft is schema
version 3 and contains 39 local tables. It remains disconnected from production
startup and does not replace the active V1/V2 database.

Mobile must not:

- replace the current production SQLite database;
- switch the active app from V1/V2 endpoints to V3 endpoints;
- implement production upload persistence;
- call `POST /api/v3/mobile/scan-pages` as an available endpoint;
- activate dynamic A4, US Letter, US Legal, mixed-question, or written-response
  scanning as physically validated.

Only `OMR-A4-10-MC-CTX-V2` is currently operationally and physically validated.

## Current Mobile V2 Gaps

The current V2 Mobile SQLite schema does not yet match the V3 contract in these
important areas:

| Current Mobile V2 | Required V3 direction |
|---|---|
| `sync_batches` | `syncs` |
| `sync_result_items` | `sync_items` |
| `question_mappings` | `part_skill_mappings` |
| `tests` directly tied to `class_assignment_id` | reusable `tests` plus scheduled `test_assignments` |
| scan/result rows keyed mainly by `test_id` | scan/result context must use exact `test_assignment_id` / `assignmentUuid` |
| answer keys downloaded locally | V3 download excludes answer keys and correct answers |
| questions store `option_a` to `option_e` inline | V3 uses normalized `question_options` |
| MC-focused local question model | V3 supports `multiple_choice`, `true_false`, `identification`, `enumeration`, and `essay` |
| `scan_status = verified` | V3 uses `accepted`, `rescan_requested`, `rejected`, etc. |
| `result_status = verified` | V3 uses `pending_verification`, `finalized`, `superseded` |
| `sync_action = create/update` | V3 upload policy uses `upsert` |

## Required V3 Local Concepts

The isolated V3 Mobile SQLite design should include these shared concepts where
practical:

- `question_types`
- `question_options`
- `term_periods`
- `class_assignment_schedules`
- `test_assignments`
- `part_skill_mappings`
- `answer_sheet_versions`
- `answer_sheet_pages`
- `answer_sheet_regions`
- `omr_templates`
- `scan_sessions`
- `omr_detections`
- `scan_verifications`
- `student_answers`
- `answer_verifications`
- `answer_rubric_scores`
- `test_results`
- `syncs`
- `sync_items`

Mobile-only support tables may remain mobile-only:

- `schema_versions`
- `reference_data_state`
- `download_snapshots`
- `download_snapshot_entities`
- `download_snapshot_rows`
- local retry fields such as `is_synced`, `sync_attempt_count`,
  `last_sync_error`, and `last_synced_at`

## DTO Alignment

### Reference Data

Mobile should model:

- contract version;
- server UTC time;
- all question-type capabilities;
- paper sizes and `operationallySupported`;
- active OMR template metadata;
- status value lists;
- sync policy, including `scanPageUploadAvailable = false`;
- `minimumAnswerSheetQuestions = 5`.

### Download Snapshot

Mobile treats `/api/v3/mobile/download` as one atomic full snapshot. The
isolated repository now:

- validates the whole payload before writing;
- upserts downloaded shared rows in one SQLite transaction;
- records per-entity SHA-256 hashes and active-snapshot row membership;
- marks the previous complete snapshot `superseded` only when the new snapshot
  is ready to commit;
- preserves shared rows that may already be referenced by offline evidence;
- replays an identical content-derived snapshot without duplicating it;
- does not expect answer keys, scores, or analytics in this response.

Consumers must use `download_snapshot_rows` for the current complete snapshot
when stale downloaded rows need to be excluded. This gives full-snapshot view
semantics without deleting historical identities referenced by local scans.

Downloaded data includes:

- teacher;
- class assignments;
- class-list memberships;
- students;
- term periods;
- test assignments;
- tests;
- test parts;
- questions;
- question options;
- part-skill mappings;
- skills;
- answer-sheet identities and manifest hashes.

### Answer-Sheet Manifest

Mobile should fetch a manifest by:

```text
/api/v3/mobile/test-assignments/{assignmentUuid}/answer-sheets/{answerSheetUuid}/manifest
```

The manifest is the source of truth for:

- paper size and page count;
- template code and geometry hash;
- page UUIDs;
- QR payload/hash;
- response regions;
- objective option coordinates;
- True/False display labels with stored values still `A/B`.

The manifest contains no student identity and no answers. The selected
`classListId` supplies student context during future capture/upload.

The current read DTO exposes `answerSheetUuid`, `pageUuid`, and `regionUuid`, but
does not expose the corresponding central numeric IDs. The local schema keeps
UUIDs as durable identities and stores nullable central IDs. The future upload
endpoint should resolve these UUIDs server-side, or the read contract must be
extended before upload is implemented.

The isolated manifest repository validates assignment, paper-size, template,
coordinate-space, question-region, and option identities before writing. A
committed manifest is immutable: an identical fetch is treated as a replay,
while mismatched identity or incomplete local state is rejected.

## Upload Boundary

`POST /api/v3/mobile/scan-pages` is contract-only and unavailable.

Mobile may design local staging rows for future upload, but must keep them
isolated from production sync. Future metadata must preserve:

- `syncUuid`
- `resultUuid`
- `scanUuid`
- `scanPageUuid`
- `answerSheetUuid`
- `pageUuid`
- `assignmentUuid`
- `classListId`
- page/capture numbers
- scanner version
- QR payload hash
- image SHA-256
- UTC capture time

The required retry behavior is idempotent:

- first valid page upload creates evidence;
- identical retry returns `replayed`;
- changed immutable payload under the same UUID returns `409` with
  `IDEMPOTENCY_KEY_REUSE`;
- one sync envelope belongs to one test assignment;
- retry must never duplicate student results or analytics rows.

The September 7 isolated schema additionally preserves:

- expected and captured page counts;
- QR payload and hash, image hash, rotation, page status, and rescan lineage;
- nullable full-page evidence links independent of a single student answer;
- central attachment types and source-attachment lineage;
- append-only answer verification and per-criterion rubric-score history;
- provisional versus backend-authoritative score snapshots; and
- payload hashes, retry timestamps, item counts, and idempotency versions.

The handoff-only `enhanced_answer_crop` value is not in the central attachment
enum. Until Backend changes that enum, enhanced crops must use the approved
`answer_crop` type with source-attachment lineage; Mobile must not upload an
unsupported attachment value.

The handoff term `received_page_count` maps to the authoritative central and
local `captured_page_count` column. Local image paths remain device-only; hashes,
UUIDs, page identities, and attachment lineage are the portable evidence contract.

## Scanner And UI Boundary

Current validated scanner support remains:

- A4 paper only;
- 10 Multiple Choice items only;
- options A-D only;
- template `OMR-A4-10-MC-CTX-V2`.

V3 design targets are not yet physically validated:

- A4 dynamic 5+ questions;
- US Letter;
- US Legal;
- mixed question types;
- written-response crop extraction;
- OCR/manual scoring workflow.

For objective MC/TF scans, teacher review must be protected:

- teacher may accept the detected answer;
- teacher may mark blank/multiple/uncertain as accepted, rescan, reject, or leave
  pending depending on the approved UX;
- teacher must not replace the detected MC/TF answer value.

For Identification, Enumeration, and Essay:

- Mobile may retain cropped evidence regions;
- scoring/transcription belongs to teacher verification or backend-approved
  OCR/manual workflow;
- Mobile must not claim automatic handwriting scoring.

## Next Controlled Mobile Work

Completed in isolation:

1. V3 read DTO definitions and fixture parsers.
2. V3 read client, not used by current production screens.
3. V3 SQLite schema version 3 aligned to the September 7 export.
4. Parallel `AssessmentStorageV3.db` initialization module.
5. Atomic reference-data, full-download, and manifest repositories.
6. Opt-in GET-to-SQLite service, not called by the current production flow.
7. Disposable SQLite foreign-key, integrity, generated write-set, and manifest
   persistence validation.
8. Active-snapshot-only diagnostic query layer.
9. Explicit login-screen V3 diagnostics entry. Opening it initializes and reads
   only `AssessmentStorageV3.db`.
10. Explicit V3 diagnostics connection using password login, authenticator or
    recovery-code MFA, in-memory Bearer token handling, and authenticated
    reference-data, download, and manifest refresh into the parallel database.

Still blocked on Backend contract completion:

1. Finalize UUID-to-central-ID resolution for sheet, page, and region identities.
2. Finalize multipart attachment values and scan-page upload persistence.
3. Finalize answer verification, rubric scoring, and authoritative score response
   DTOs.
4. Confirm whether class-assignment schedules belong in the Mobile download.
5. Confirm whether the download should expose class-level status separately from
   `classAssignments[].status`; Mobile does not infer one from the other.
6. Add production-grade secure token persistence only when V3 becomes the active
   Mobile runtime. The isolated diagnostic connection intentionally forgets its
   token after app restart.
7. Run upgrade, device, retry, upload, backend scoring, and web analytics
   acceptance only after those contracts are implemented.

## Explicit Non-Goals

- No production Mobile SQLite migration in this slice.
- No V1/V2 endpoint removal.
- No automatic V3 database initialization outside the explicit diagnostics
  screen.
- No automatic V3 endpoint calls outside the explicit diagnostics connection.
- No persistent plaintext V3 token storage.
- No live sync upload switching.
- No dynamic answer-sheet generator implementation.
- No new physical scanner template activation.
- No official analytics calculation on Mobile.
