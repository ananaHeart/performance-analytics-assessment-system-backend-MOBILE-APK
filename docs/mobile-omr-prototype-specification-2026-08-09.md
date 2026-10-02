# Isolated Fixed-Template OMR Prototype Specification

**Document date:** August 9, 2026  
**Prototype status:** Isolated and under validation  
**Prototype path:** `D:\ThesisProjects\OMRPrototype`  
**Production impact:** None

## 1. Database and Integration Boundary

The backend team has created and validated a separate V2 database. The current
production mobile SQLite database, backend V1, and TiDB remain unchanged.

This Python/OpenCV work is an isolated scanner prototype. It does not write to
production SQLite, call the current sync API, create final `student_answers`,
or migrate any production database.

Future alignment remains:

`scan_sessions -> omr_detections -> teacher verification -> test_results + student_answers -> syncs + sync_items`

## 2. Supported Scope

Supported prototype question types:

- `multiple_choice` using A-D or another approved set of 2-5 one-character labels
- `true_false` printed as T/F and returned as `TRUE`/`FALSE`

Explicitly unsupported as OMR answers:

- Identification
- Enumeration

The detector rejects scanner maps whose `question_type` is not
`multiple_choice` or `true_false`.

## 3. Template Dimensions and Versions

| Property | Value |
| --- | --- |
| Paper size | A4 |
| PDF width | 595.276 points |
| PDF height | 841.890 points |
| Scanner alignment size | 1191 x 1684 pixels |
| Alignment scale | 2.0 pixels per PDF point |
| Active item count | 10 |
| Grid geometry | 3 columns, 17 possible rows per column |
| Corner markers | Four 15-point square registration markers |
| MC template version | `OMR-A4-10-MC-V2` |
| T/F template version | `OMR-A4-10-TF-V2` |
| Scanner version | `python-opencv-omr-prototype-0.2` |

The approved prototype outputs are:

- `D:\ThesisProjects\OMRPrototype\omr_mc_10_v2.pdf`
- `D:\ThesisProjects\OMRPrototype\omr_mc_10_v2.json`
- `D:\ThesisProjects\OMRPrototype\omr_tf_10_v2.pdf`
- `D:\ThesisProjects\OMRPrototype\omr_tf_10_v2.json`

## 4. Runtime Versions

| Technology | Validated version |
| --- | --- |
| Python | 3.14.2 |
| OpenCV | 5.0.0 |
| ReportLab | 5.0.0 |
| PyMuPDF | 1.28.2 |

ReportLab generates the PDF and QR identity. PyMuPDF is used only for local
PDF rendering and QA. OpenCV performs page alignment, QR decoding, circle
localization, and mark measurement.

## 5. Test and Student Identity

Students do not manually write an LRN or assessment code. The system-generated
QR contains compact identity data:

```json
{
  "v": 1,
  "tv": "OMR-A4-10-MC-V2",
  "t": "TEST-DEMO-001",
  "s": "STUDENT-DEMO-001",
  "q": "MC",
  "n": 10
}
```

The scanner normalizes this to:

```json
{
  "payloadVersion": "omr-sheet-v1",
  "templateVersion": "OMR-A4-10-MC-V2",
  "testId": "TEST-DEMO-001",
  "studentId": "STUDENT-DEMO-001",
  "questionType": "multiple_choice",
  "itemCount": 10
}
```

The QR identity must match the selected scanner map's template version,
question type, and item count. A missing or mismatched identity cannot produce
final student answers and must be resolved during verification.

## 6. Detection Pipeline

1. Detect the paper contour.
2. Perspective-warp the page to the standard A4 scanner size.
3. Decode the QR identity before fine marker correction.
4. Locate the four printed square registration markers.
5. Apply a second marker-based perspective correction.
6. Read expected bubble centers from the generated JSON scanner map.
7. Measure locally normalized darkness inside each bubble annulus.
8. Classify each item as detected, blank, multiple marks, or uncertain.
9. Write scanner evidence only; do not create final student answers.

If all four registration markers cannot be located, the prototype falls back
to page alignment plus nearby printed-circle snapping.

## 7. Detection Thresholds

| Parameter | Value | Purpose |
| --- | --- | --- |
| Strong/detected threshold | `0.75` | A mark at or above this score is strongly filled |
| Possible/uncertain threshold | `0.30` | A non-strong mark at or above this score requires verification |
| Local darkness delta | `22` grayscale levels | A pixel must be this much darker than local paper background |
| Bubble sampling annulus | `0.38r` to `0.72r` | Excludes most printed option letters and the outer ring |
| Background annulus | `1.25r` to `1.65r` | Estimates local paper brightness |
| Marker search radius | `55` pixels | Searches around each expected corner marker |
| Hough circle radius | `9` to `18` pixels | Used for printed-circle fallback detection |
| Maximum fallback center snap | `28` pixels | Prevents distant contours from being accepted as bubbles |

These are prototype thresholds from one physical photo plus clean digital
template validation. They are not yet production acceptance thresholds.

## 8. Uncertainty Rules

- Exactly one option at or above `0.75` -> `detected`.
- More than one option at or above `0.75` -> `multiple_marks` and no final option.
- No strong option, but one or more options at or above `0.30` -> `uncertain`.
- Every option below `0.30` -> `blank`.
- Missing/unreadable QR -> identity failure, even if bubbles can be measured.
- QR/map mismatch -> identity mismatch and mandatory teacher resolution.
- Every scanner output requires teacher verification before final answers exist.

## 9. Scanner Output Contract

The scanner returns camelCase JSON for contract planning. It does not return or
write final `student_answers`.

```json
{
  "scannerVersion": "python-opencv-omr-prototype-0.2",
  "templateVersion": "OMR-A4-10-MC-V2",
  "questionType": "multiple_choice",
  "identityStatus": "detected",
  "sheetIdentity": {
    "testId": "TEST-DEMO-001",
    "studentId": "STUDENT-DEMO-001"
  },
  "teacherVerificationRequired": true,
  "finalStudentAnswersGenerated": false,
  "detections": [
    {
      "itemNumber": 1,
      "detectedOption": "A",
      "confidenceScore": 0.981,
      "detectionStatus": "detected",
      "rawMarkInformation": {
        "markedOptions": ["A"],
        "optionScores": {
          "A": 0.981,
          "B": 0.731,
          "C": 0.692,
          "D": 0.702
        },
        "scoreGap": 0.25
      }
    }
  ]
}
```

`questionId` may be returned later when the approved scanner map contains a
stable backend question identifier. `itemNumber` is currently always returned.

## 10. Teacher Correction Flow

1. Scanner creates raw identity and item detections.
2. Verification UI displays detected, blank, multiple-mark, and uncertain items.
3. Teacher reviews the original image and every detected answer.
4. Teacher confirms or corrects each answer.
5. Raw scanner evidence remains unchanged in `omr_detections` later.
6. Teacher-confirmed values are written separately as verified student answers later.
7. Only verified answers may produce `test_results` and `student_answers`.
8. Sync remains unavailable to the prototype until the mobile/backend contract is approved.

## 11. Errors Encountered and Corrections

| Error | Cause | Prototype correction |
| --- | --- | --- |
| Zero bubbles detected from the first printed photo | Old detector used screenshot-specific contour sizes | Replaced fixed pixel contour filtering with generated coordinates and page alignment |
| Every option reported as multiple marks | Page-edge alignment left 7-20 pixel drift and printed letters were counted | Added registration-marker alignment and annular fill sampling |
| Clean MC sheet produced false uncertain rows | Hough snapping selected nearby circle geometry and B/D letters raised scores | Use marker alignment and exact map centers; Hough snapping is fallback only |
| First QR could not be decoded | Payload was too long and QR was too small/dense | Shortened QR keys, enlarged QR, and added a quiet zone |
| QR failed after fine marker alignment | Fine warp reduced QR readability | Decode QR after page alignment, before marker refinement |
| Q1 initially remained uncertain | Light shading plus photo alignment reduced score separation | Marker-based alignment recalibration detected Q1 as A |
| Legacy Test 01 cannot identify test/student | It was printed before QR identity was added | Retained as mark-detection evidence only; new physical QR sheet is required |

## 12. Validation Status and Remaining Work

Confirmed:

- QR identity decodes from clean digital MC and T/F templates.
- Clean blank MC template returns 10 blank items.
- Clean blank T/F template returns 10 blank items.
- Physical legacy sheet aligns and detects strong marks.
- Physical double mark is preserved as `multiple_marks`.
- Scanner JSON contains requested item number, option, confidence, status, and raw evidence.

Not yet confirmed:

- QR decoding from a newly printed and photographed V2 sheet.
- Physically shaded True/False detection.
- Multiple phones, camera distances, lighting conditions, folds, erasures, and dark pens.
- Mixed Multiple Choice and True/False parts on one physical sheet.
- React Native/native OpenCV integration.
- SQLite, backend V2 DTO, sync, or TiDB integration.

The OpenCV output should not be declared stable for mobile integration until at
least the new physical QR-enabled MC sheet and a physical T/F sheet pass the
same controlled verification flow.
