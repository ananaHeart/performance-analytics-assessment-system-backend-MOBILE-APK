# Mobile V1 and V2 OMR Boundary and Workflow

**Document date:** August 15, 2026  
**Current status update:** August 22, 2026  
**Document type:** Architecture and workflow documentation  
**Implementation authority:** V2 API contract and approved backend planning references  
**Code and database impact of this documentation task:** None

## 1. Purpose

This document separates the currently working V1 mobile application from the
isolated V2 Optical Mark Recognition (OMR) prototype. It also defines the
intended end-to-end V2 workflow without describing pending integration as
implemented or deployed.

The mobile application has two distinct states:

1. **V1 production workflow:** existing offline manual checking and V1
   synchronization.
2. **V2 target workflow:** fixed-template OMR scanning, teacher verification,
   V2 SQLite storage, retry-safe batch synchronization, and backend scoring.

V1 remains the active mobile runtime until V2 migration, integration, and
acceptance tests are completed. The Python/OpenCV scanner remains an isolated
prototype and does not currently replace V1.

## 2. Current V1 Mobile Application

### 2.1 Current V1 flow

```text
Teacher login
-> download assigned V1 data
-> select class
-> select assessment
-> select student
-> manually mark items correct or incorrect
-> save test_results and item_responses in production SQLite
-> upload unsynced results through the V1 sync API
-> backend stores or updates results
-> web analytics reads backend results
```

### 2.2 Current V1 responsibilities

- React Native provides the teacher interface.
- Production SQLite stores downloaded reference data and offline checking work.
- Manual checking records correctness using the current `test_results` and
  `item_responses` structures.
- V1 download remains `GET /api/sync/download/{teacherId}`.
- V1 upload remains `POST /api/sync/upload`.
- V1 synchronization is manually initiated and supports delayed upload.
- Existing unsynced local work is preserved until a successful upload.

### 2.3 V1 limitations relevant to V2

V1 item responses primarily store whether an item was correct. They do not
reliably preserve the actual selected option and authoritative V2 `questionId`.
Therefore, V1 item responses cannot be treated as complete V2
`student_answers` without an approved adapter or migration rule.

## 3. Isolated V2 OMR Prototype

The isolated prototype is located at:

`D:\ThesisProjects\OMRPrototype`

It uses Python and OpenCV to validate whether a fixed printed answer sheet can
be aligned, identified, and interpreted before React Native integration.

The prototype currently:

- generates fixed A4 answer sheets and scanner maps;
- reads a QR identity from the sheet;
- aligns a photographed sheet using four printed corner markers;
- measures bubble darkness at predefined coordinates;
- produces raw per-item detections and confidence evidence;
- flags unclear, blank-like, and multiple-mark cases;
- requires teacher verification before final answers exist.

The separate Python prototype does **not** itself:

- write scanner output into production V1 SQLite;
- upload OMR records through the V1 sync API;
- call the planned V2 upload endpoint;
- create production backend results or analytics;
- migrate the production TiDB/MySQL database.

### 3.1 August 18 partial mobile integration update

Android-native OpenCV scanning, camera/gallery acquisition, fixed-template MC
detection, and teacher review were added to the React Native source on August
18. App.tsx also initializes the separate V2 SQLite database. The reviewed scan
is saved only when authoritative downloaded V2 context can be resolved.

This is partial mobile V2 source integration, not a completed production flow:

- a fresh phone build and scanning regression remains required;
- the app does not call `GET /api/v2/sync/download`;
- the app does not call `POST /api/v2/sync/upload`;
- missing V2 context prevents the reviewed prototype scan from being written
  to V1 SQLite; and
- backend scoring and web analytics have not been validated end to end.

## 4. Target V2 OMR Workflow

The approved target flow is:

```text
Paper bubble sheet
-> mobile scan
-> QR and template validation
-> page alignment
-> OMR detection
-> teacher verification
-> V2 SQLite offline storage
-> retry-safe batch synchronization
-> Spring Boot backend validation and scoring
-> TiDB/MySQL persistence
-> verified analytics and intervention processing
```

The teacher-facing sequence is:

1. The teacher logs in through V2 authentication.
2. The teacher downloads authorized classes, class memberships, assessments,
   questions, answer keys, and skill mappings from
   `GET /api/v2/sync/download`.
3. The teacher selects a class, assessment, and student.
4. The teacher scans one complete fixed-template answer sheet.
5. The mobile scanner validates the QR against the selected assessment and
   approved scanner map.
6. OpenCV aligns the paper and measures the predefined bubble positions.
7. Raw scanner output is stored as detections, not final answers.
8. The teacher confirms clear detections and resolves uncertain, blank, or
   multiple-mark cases.
9. The verified attempt and answers are saved offline in V2 SQLite.
10. The mobile application groups unsynced attempts into a batch for one
    `testId` and later sends the batch to `POST /api/v2/sync/upload`.
11. The backend validates ownership, membership, UUID identity, test/question
    relationships, and verification state.
12. The backend calculates correctness, points, total score, maximum score,
    and evaluated-item count from verified answers and the stored answer key.
13. Analytics use verified `student_answers`, never unverified raw detections.

## 5. Supported Assessment Types

| Assessment type | V1 treatment | Initial V2 OMR treatment |
| --- | --- | --- |
| Multiple Choice | Manual checking supported | Initial fixed-template OMR type; physical MC testing completed |
| True or False | Manual checking supported | Not implemented by the current phone scanner; future scope only if re-approved |
| Identification | Manual checking | Not an OMR bubble answer; remains manual or future enhancement |
| Enumeration | Manual checking | Not an OMR bubble answer; remains manual or future enhancement |

The current phone-scanner scope is the fixed ten-item Multiple Choice sheet.
Mixed sheets and True or False scanning are excluded from the current
implementation unless a separate template, detector rule, and physical
validation are approved later.

## 6. Fixed Template and QR Identity

The authoritative physically validated Multiple Choice template is:

`OMR-A4-10-MC-CTX-V2`

This template identifies one immutable combination of paper size, item count,
question type, options, marker positions, bubble coordinates, and geometry
revision. Geometry changes require a new template version.

The compact V2 QR contract uses:

```json
{
  "v": 2,
  "tv": "OMR-A4-10-MC-CTX-V2",
  "t": 101,
  "cl": 501,
  "qt": "multiple_choice",
  "n": 10
}
```

| QR key | Meaning |
| --- | --- |
| `v` | QR payload/contract version |
| `tv` | Immutable template version |
| `t` | Backend `testId` |
| `cl` | Backend `classListId` for the learner membership |
| `qt` | Question type, such as `multiple_choice` or `true_false` |
| `n` | Item count |

The authenticated teacher is not identified by the QR. `questionId` is also
not inferred from handwriting; item positions are mapped to downloaded
questions through the approved test/template mapping. `itemNumber` is for
display and diagnostics, while `questionId` is authoritative for persistence.

The August 10 physical prototype QR contained template version, test ID,
question type, and item count. The full V2 contract adds `classListId`; that
expanded identity still requires integrated mobile testing.

## 7. Detection and Verification Statuses

### 7.1 Scan status

| Value | Meaning |
| --- | --- |
| `captured` | Image was captured locally |
| `processing` | Alignment and detection are running |
| `needs_verification` | Scanner output requires teacher review |
| `verified` | Teacher completed verification; eligible for upload |
| `failed` | Capture or processing failed |

### 7.2 Raw detection status

| Value | Meaning |
| --- | --- |
| `detected` | One option was detected with sufficient evidence |
| `blank` | No marked option was detected |
| `multiple_marks` | More than one option appears marked |
| `uncertain` | Evidence is insufficient for automatic selection |

For `blank`, `multiple_marks`, and `uncertain`, `detectedOption` remains null.
Raw option scores and marked-option evidence remain available for review.

### 7.3 Teacher verification status

| Value | Meaning |
| --- | --- |
| `pending` | Not yet reviewed by the teacher |
| `confirmed` | Teacher accepted the scanner interpretation |
| `corrected` | Teacher replaced or resolved the scanner interpretation |

### 7.4 Final answer status and source

Final answer statuses are `answered`, `blank`, `multiple`, and `invalid`.
Capture sources are `omr`, `teacher_correction`, and `manual`.

Raw `omr_detections` remain separate from final `student_answers`. A teacher
correction changes the final answer but does not delete or rewrite the raw OMR
evidence.

For an authorized fully manual result:

- `scanSession` is null;
- no scan, detection, or result-scan row is created;
- final answers use `captureSource: manual`.

## 8. Retry-Safe UUID Rules

| UUID | Scope and retry rule |
| --- | --- |
| `syncUuid` | One upload batch; reuse only when retrying that same batch |
| `resultUuid` | One student assessment attempt; retain across edits and retries |
| `scanUuid` | One physical captured image; retain on retry, but generate a new UUID for a recapture |
| `answerUuid` | One result/question answer; retain when corrected or retried |

No central `detectionUuid` is required. A detection is identified by
`scanUuid + questionId`.

One V2 upload batch contains results for one `testId`. Results for another test
use another `syncUuid`. A partial-success response is handled per result:
successful items become synced, while failed items retain their UUIDs and
errors for retry.

An edit after a completed synchronization keeps the same result and answer
UUIDs, uses `syncAction: update`, and belongs to a new upload batch.

## 9. Physical Testing Evidence

### 9.1 August 9, 2026: Initial prototype test

- A generated ten-item A-D sheet was printed and photographed.
- Perspective alignment and scanner-map coordinates were validated.
- A deliberate double mark was preserved as `multiple_marks`.
- Weak or unclear marks were not silently finalized.
- Marker recalibration corrected Q1 from uncertain to detected A.
- This legacy sheet predated the final QR-enabled context template.

Evidence:

- `docs/mobile-omr-prototype-test-2026-08-09.md`
- `D:\ThesisProjects\OMRPrototype\filled_sheet_01.jpg`
- `D:\ThesisProjects\OMRPrototype\output\test01_recalibrated`

### 9.2 August 10, 2026: QR-enabled clean MC test

- Template: `OMR-A4-10-MC-CTX-V2`
- Test ID: `101`
- Source: `filled_mc_context_v2.jpg`
- Expected: A, B, C, D, A, B, C, D, A, B
- Detected: A, B, C, D, A, B, C, D, A, B
- Result: 10 of 10 exact detections.
- QR identity and four-marker alignment passed.

Evidence:

`D:\ThesisProjects\OMRPrototype\output\physical_mc_v2_clean`

### 9.3 August 10, 2026: MC verification-routing test

- Six intentional single A marks were detected correctly.
- Physical blanks on Q3, Q6, and Q9 were conservatively classified as
  `uncertain` because of image darkness and routed to teacher verification.
- The A/D double mark on Q7 was classified as `multiple_marks`.
- No uncertain or multiple-mark item produced a final selected option.

Evidence:

`D:\ThesisProjects\OMRPrototype\output\physical_mc_v3_edge_cases`

These results validate the fixed-template direction, not production accuracy
or readiness across all phones, lighting conditions, and paper states.

## 10. Prototype Detection Configuration

The August 10 physical tests used:

| Rule | Prototype value |
| --- | ---: |
| Strong detected threshold | `0.75` |
| Possible/uncertain threshold | `0.30` |
| Local darkness delta | `22` |
| Center-snap maximum distance | `28 pixels` |

These are recorded prototype values, not final production acceptance
thresholds. A larger labeled physical-image set is required before threshold
freeze.

## 11. Limitations

- Only approved fixed templates are supported; arbitrary paper layouts are not.
- OMR does not read handwritten names, LRNs, Identification, or Enumeration
  answers.
- Camera blur, shadows, folds, tilt, uneven lighting, erasures, faint marks,
  and low-end devices can reduce confidence.
- Teacher verification is mandatory; the system must not claim 100% automatic
  detection.
- Blank versus uncertain classification still needs more physical samples.
- One physical sheet supports one question type in the initial release.
- Physical True/False testing is still pending.
- Current evidence uses a Python/OpenCV desktop prototype, not on-device native
  OpenCV processing.
- Mobile image retention, deletion, privacy, and storage-size policies remain
  to be approved.
- Backend scoring must use verified answers and stored answer keys; mobile
  provisional totals are not authoritative.

## 12. Pending V2 Integration

### Backend available for alignment

- V2 authentication
- V2 teacher and school/class-assignment structures
- V2 assessment creation
- `GET /api/v2/sync/download`
- frozen V2 mobile/backend contract documentation

### Still pending before production use

- production validation and hardening of the existing React Native
  camera/document-capture source
- physical-device acceptance testing of native OpenCV OMR processing
- teacher-verification runtime regression and acceptance testing
- approved V2 SQLite migration and production initialization beyond the
  isolated V2 database source
- persistence of scan sessions, detections, verified results, and answers
- `POST /api/v2/sync/upload` runtime
- retry and partial-success integration tests
- backend OMR persistence and verified-answer scoring runtime
- V2 analytics, intervention, and export runtime
- frontend V2 integration
- TiDB V2 migration and rollback validation
- end-to-end acceptance testing on representative Android devices

Any isolated V2 storage scaffold is non-production until it is imported by the
application, initialized through an approved migration, tested, and connected
to implemented V2 endpoints. Its presence must not be described as completed
V2 SQLite integration.

## 13. Documentation Status Statement

The accurate manuscript wording is:

> As of August 22, 2026, the current V1 React Native application supports
> offline manual checking and delayed synchronization. A separate V2
> fixed-template OMR prototype has
> demonstrated QR validation, marker-based alignment, exact detection on one
> clean ten-item Multiple Choice sheet, and safe verification routing for blank
> and multiple-mark cases. Android-native ten-item Multiple Choice scanning,
> camera/gallery input, and teacher-review source were added on August 18, but
> require current device validation and are not connected to V2 download or
> upload. Identification, Enumeration, and phone-side True or False scanning
> are not implemented in the current detector. Backend scoring and production
> integration remain under development and must not be described as fully
> implemented or deployed.

## 14. Evidence References

- `docs/MOBILE_APP_DOCUMENTATION.md`
- `docs/mobile-omr-prototype-specification-2026-08-09.md`
- `docs/mobile-omr-prototype-test-2026-08-09.md`
- `docs/MOBILE_GANTT_CHART_EVIDENCE.md`
- `D:\ThesisProjects\OMRPrototype\OMR_PHYSICAL_TEST_REPORT_2026-08-10.md`
- `D:\CAPSTONE_2\backend\assessment\docs\V2_API_SYNC_CONTRACT.md`
- `D:\CAPSTONE_2\backend\assessment\docs\performance_assessment_v2_schema.sql`
