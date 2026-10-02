# Mobile OMR Prototype Test Report

**Test date:** August 9, 2026  
**Test number:** OMR Prototype Test 01  
**Status:** Completed - prototype validation only  
**Prototype path:** `D:\ThesisProjects\OMRPrototype`

## 1. Objective

Validate whether a printed fixed-template bubble sheet can be photographed,
perspective-aligned, and interpreted offline using Python and OpenCV before any
React Native, SQLite, sync API, or backend integration is approved.

## 2. Test Setup

- Template: `omr_10_items.pdf`
- Scanner map: `omr_10_items.json`
- Template geometry version: `OMR-A4-50-V1`
- Active item count: 10
- Options: A, B, C, D
- Input photo: `filled_sheet_01.jpg`
- Input image size: 635 x 868 pixels
- Perspective-aligned size: 1191 x 1684 pixels
- Detector: `detect_bubbles.py`
- Processing: local/offline Python and OpenCV
- OpenCV version: 5.0.0

The template version identifies the stable A4 geometry and maximum 50-item
coordinate layout. This test used only the first 10 item positions.

## 3. Expected and Observed Results

| Item | Expected mark | Detector result | Status |
| --- | --- | --- | --- |
| Q1 | A | Initially uncertain; recalibration detected A | Detected after marker calibration |
| Q2 | A | A | Detected |
| Q3 | A | A | Detected |
| Q4 | A and B | A and B | Multiple marks correctly flagged |
| Q5 | A | A | Detected |
| Q6 | A | A | Detected |
| Q7 | No confirmed single option | No final option | Uncertain - teacher verification required |
| Q8 | A | A | Detected |
| Q9 | A | A | Detected |
| Q10 | No confirmed single option | No final option | Blank after marker calibration |

The first scoring pass left Q1 uncertain even though it was actually A. After
the four registration markers were used for fine alignment and the printed
letters were excluded from the fill region, Q1 was detected as A. Q4 remained
a multiple mark, Q7 remained uncertain, and Q10 was classified as blank.

## 4. Confirmed Prototype Behavior

- The photographed paper boundary was detected.
- The page was corrected for perspective and aligned to A4 coordinates.
- The generated JSON map was used instead of screenshot-specific pixel sizes.
- Printed bubble positions were located and snapped to their photographed
  circle centers before scoring.
- Strong single marks were detected.
- The A and B double mark on Q4 was preserved as `multiple_marks`.
- Weak or unclear marks were not silently accepted as final answers.
- The detector produced both human-readable and structured JSON results.
- Marker-based recalibration corrected Q1 from uncertain to detected A.

## 5. Evidence Files

- `D:\ThesisProjects\OMRPrototype\filled_sheet_01.jpg`
- `D:\ThesisProjects\OMRPrototype\output\02_page_corners.png`
- `D:\ThesisProjects\OMRPrototype\output\03_aligned_sheet.png`
- `D:\ThesisProjects\OMRPrototype\output\04_detected_answers.png`
- `D:\ThesisProjects\OMRPrototype\output\detected_answers.json`
- `D:\ThesisProjects\OMRPrototype\output\detected_answers.txt`

## 6. Interpretation

The test supports the proposed fixed-template OMR direction, but it does not
prove production accuracy. The initial Q1 result demonstrates why calibration
and teacher verification are core workflow requirements: light shading, image
blur, and alignment can reduce confidence even when a person sees the answer.

The raw OMR output must remain separate from the final teacher-confirmed answer.
An uncertain or multiple-mark result must not be scored as final until the
teacher confirms or corrects it.

## 7. Scope Boundary and Next Actions

This test did not modify or validate React Native camera integration, mobile
SQLite tables, synchronization payloads, Spring Boot endpoints, or TiDB/MySQL
entities. Those changes remain approval-gated while the backend and mobile data
contracts are being finalized.

Recommended next validation steps:

1. Repeat with several sheets and different lighting conditions.
2. Include intentionally blank, faint, erased, and multiple-mark bubbles.
3. Define the approved confidence thresholds for teacher verification.
4. Confirm the backend contract before adding OMR records to SQLite or sync.
5. Integrate the verified prototype into React Native only after contract approval.

## 8. Recalibration Evidence

The marker-aligned rerun is stored separately so the original evidence remains
available:

- `D:\ThesisProjects\OMRPrototype\output\test01_recalibrated\04_detected_answers.png`
- `D:\ThesisProjects\OMRPrototype\output\test01_recalibrated\detected_answers.json`

The QR identity status is expected to fail for this legacy sheet because it was
printed before the QR-enabled V2 templates were created.

## 9. August 10, 2026 Physical Validation Tests 02 and 03

Two additional physical tests were completed using the QR-enabled fixed A4
10-item Multiple Choice template `OMR-A4-10-MC-CTX-V2` and expected `testId=101`.
The current approved prototype scope is Multiple Choice only.

### Test 02: Clean single-answer sheet

- Source: `D:\ThesisProjects\OMRPrototype\filled_mc_context_v2.jpg`
- Expected answers: `A, B, C, D, A, B, C, D, A, B`
- Detected answers: `A, B, C, D, A, B, C, D, A, B`
- Result: 10 of 10 exact detections
- QR identity: passed
- Alignment method: `original_markers`
- Evidence: `D:\ThesisProjects\OMRPrototype\output\physical_mc_v2_clean`

### Test 03: Blank and multiple-mark sheet

- Source: `D:\ThesisProjects\OMRPrototype\filled_mc_context_v3.jpg`
- Single marks on Q1, Q2, Q4, Q5, Q8, and Q10 were detected as A.
- Blank Q3, Q6, and Q9 produced no selected option and were routed as
  `uncertain` for teacher verification.
- Double-marked Q7 produced no selected option and was correctly routed as
  `multiple_marks`, preserving A and D as raw marks.
- QR identity: passed
- Alignment method: `original_markers`
- Evidence: `D:\ThesisProjects\OMRPrototype\output\physical_mc_v3_edge_cases`

The blank items are conservatively classified as `uncertain` rather than
`blank` because of elevated background darkness in the second camera image.
This avoids false final answers but remains a threshold-tuning item for a
larger physical-image test set.

The initial physical run exposed two issues that were corrected in the
isolated scanner:

1. Small QR codes now use enlarged top-right color and grayscale decode
   fallbacks.
2. Perspective alignment now uses the four original printed square markers
   instead of mistakenly treating the complete camera frame as the paper.

The complete August 10 test environment, commands, item-level results, SHA-256
hashes, limitations, and conclusions are recorded in:

`D:\ThesisProjects\OMRPrototype\OMR_PHYSICAL_TEST_REPORT_2026-08-10.md`

These tests did not modify or connect production mobile SQLite, synchronization,
Spring Boot, or TiDB/MySQL.
