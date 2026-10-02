# V3 Dynamic Scanner-2 Architecture

**Date:** September 5, 2026  
**Status:** Isolated mobile prototype; device retest pending  
**Scope:** A4, US Letter, and US Legal V3 dynamic answer sheets

## Purpose

Scanner-2 improves QR reliability, processing time visibility, capture-quality
diagnostics, and written-response readability without changing assessment
answers, grading rules, SQLite, sync, or backend APIs.

The implementation remains offline. It does not upload scans, save grades,
finalize answers, or perform handwriting recognition.

## Technology Responsibilities

| Component | Responsibility |
|---|---|
| ZXing 3.5.4 | Primary QR decoding from likely page-corner regions |
| OpenCV 4.13.0 | QR fallback, marker detection, perspective alignment, bubble analysis, crop extraction, quality measurements, and image enhancement |
| React Native | Scanner test UI, diagnostics, result review, and Original/Enhanced evidence switch |

ZXing does not replace OpenCV. It replaces only the first QR-decoding attempt.
OpenCV remains the primary document-geometry and OMR processing engine.

## Processing Pipeline

1. Load the original camera or gallery image.
2. Measure initial sharpness, brightness, shadows, highlights, and illumination
   variation on a bounded sample.
3. Search four overlapping corner regions for the page QR.
4. Decode each bounded QR region with ZXing; use CLAHE/Otsu OpenCV decoding as
   fallback.
5. Determine page orientation from the corner containing the QR.
6. Validate the exact QR payload against the bundled immutable V3 manifest.
7. Downscale only the geometry-processing image when its largest dimension is
   greater than 2600 pixels.
8. Detect all four registration markers and measure page coverage and
   perspective skew.
9. Perspective-warp the page into its manifest coordinate space.
10. Validate the hollow top-left orientation marker and three solid markers.
11. Analyze Multiple Choice and True/False bubbles using manifest coordinates
    and local darkness measurements.
12. Extract Identification, Enumeration, and Essay regions as original evidence.
13. Create separate illumination-normalized, CLAHE-enhanced, mildly sharpened
    previews for teacher review.
14. Return detections, evidence URIs, quality diagnostics, and stage timings to
    React Native.

The QR path no longer rotates and repeatedly enlarges the complete page four
times. QR candidate images are capped at 1400 pixels on their largest side.

## Question-Type Rules

| Question type | Scanner behavior | Teacher authority |
|---|---|---|
| Multiple Choice | Detects one mark, blank, multiple marks, or uncertain | May accept, rescan, or reject; must not replace detected answer |
| True/False | Same objective detection; displayed as T/F while stored values remain A/B | Same objective verification rule |
| Identification | Captures original and enhanced written-response crops | Reviews and assigns exact numeric score |
| Enumeration | Captures the complete numbered response region | Reviews and assigns exact numeric score |
| Essay | Captures the writing area as evidence | Uses assigned rubric or exact numeric-score fallback |

Identification, Enumeration, and Essay are not scanner failures when no text is
automatically recognized. Their approved V3 workflow is capture followed by
teacher verification and scoring.

## Quality Diagnostics

Scanner-2 returns:

- `focusScore`: variance derived from the grayscale Laplacian;
- `meanBrightness`;
- `shadowPercent` and `highlightPercent`;
- `illuminationRange`: brightness difference across a 4 by 4 page sample;
- `pageCoveragePercent`;
- `perspectiveSkewPercent`; and
- human-readable warnings.

The current warning thresholds are prototype calibration values. They provide
guidance but do not independently finalize or reject a student result. Physical
tests across both older and newer phones are required before these thresholds
become an acceptance contract.

## Evidence Integrity

- `originalPageSha256` identifies the captured source image.
- `evidenceImageUri` points to the original perspective-aligned crop.
- `evidenceSha256` hashes that original crop.
- `enhancedImageUri` points to a derived teacher-review preview.
- `enhancementMethod` is
  `illumination_normalization_clahe_unsharp`.

The enhanced preview is never authoritative evidence and never replaces the
student response. The UI allows the teacher to switch between **Enhanced** and
**Original**.

## Timing Contract

The mobile result exposes:

- `qrDecodeMs`;
- `alignmentMs`;
- `analysisMs`; and
- `totalMs`.

These values allow physical tests to distinguish QR delay from marker alignment,
bubble analysis, enhancement, and file output.

## Files

- `android/app/src/main/java/com/mobileassessmentapp/DynamicOmrDetector.kt`
- `android/app/src/main/java/com/mobileassessmentapp/OmrScannerModule.kt`
- `src/native/dynamicOmrScanner.ts`
- `src/prototypes/v3DynamicOmrScanner/DynamicOmrScannerPrototype.tsx`
- `android/app/src/main/assets/omr/dynamic/`
- `artifacts/dynamic-omr-test/mobile-assessment-dynamic-omr-v3-scanner-2.apk`

## APK Record

- Package: `com.mobileassessmentapp`
- Version: `1.1-scanner-test`
- Version code: `2`
- Minimum Android API: 24
- SHA-256:
  `0034A998191741E7CFD4ECE500CC3600404DD26CAC780200416E2A04FB5D6D6E`
- Signing: Android APK Signature Scheme v2 using the local test certificate

## Verification Status

Completed locally:

- Android release build;
- Kotlin compilation;
- TypeScript type checking;
- focused ESLint;
- 34 focused Jest tests; and
- APK signature and metadata verification.

Physical evidence before Scanner-2 showed that V3 A4 page identity, four-marker
alignment, MC/TF detection, and written-response cropping can succeed on a real
phone. Scanner-2 itself still requires retesting on the Honor 400 and Redmi 5
Plus before any performance or reliability improvement is claimed as validated.

## Deferred Capture Upgrade

The current prototype opens the phone's installed camera application through an
Android capture intent. It cannot directly control continuous autofocus,
exposure metering, torch, live angle feedback, or stable-frame auto-capture.

The next capture-layer milestone is a dedicated CameraX viewfinder with:

- tap and center autofocus;
- auto-exposure and white-balance metering;
- optional torch control;
- live marker/page-boundary guidance;
- blur, glare, distance, and angle checks before capture; and
- automatic capture only after several stable frames.

CameraX supports focus/metering, exposure, torch, high-quality image capture,
and real-time image analysis:

- <https://developer.android.com/media/camera/camerax/configuration>
- <https://developer.android.com/media/camera/camerax/take-photo>
- <https://developer.android.com/media/camera/camerax/analyze>

ZXing is an open-source barcode library and OpenCV provides the image-processing
operations used by this prototype:

- <https://github.com/zxing/zxing/releases>
- <https://docs.opencv.org/4.12.0/javadoc/org/opencv/imgproc/Imgproc.html>

Google ML Kit Document Scanner was reviewed but not selected for this isolated
offline scanner. Its scanner logic and models are delivered dynamically through
Google Play services, which adds a first-use dependency and makes it less
predictable for disconnected physical validation on older devices:

- <https://developers.google.com/ml-kit/vision/doc-scanner/android>

## Explicit Non-Claims

Scanner-2 is not production-ready and does not establish:

- physical validation for dynamic A4, US Letter, or US Legal templates;
- automatic handwriting understanding;
- official teacher scoring or analytics;
- production SQLite migration;
- backend scan upload; or
- support for arbitrary newly generated manifests.
