package com.mobileassessmentapp

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Base64
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import org.json.JSONArray
import org.json.JSONObject
import org.opencv.android.OpenCVLoader
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfDouble
import org.opencv.core.MatOfInt
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Rect
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import org.opencv.objdetect.QRCodeDetector
import java.io.File
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.EnumMap
import java.util.UUID
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

data class DynamicOmrSheetIdentity(
  val payloadVersion: Int,
  val answerSheetUuid: String,
  val pageUuid: String,
  val assignmentUuid: String,
  val pageNumber: Int,
  val totalPages: Int,
  val templateCode: String,
  val templateVersion: String,
  val geometryHash: String,
)

data class DynamicOmrDetection(
  val regionUuid: String,
  val questionId: Long,
  val questionUuid: String,
  val itemNumber: Int,
  val questionType: String,
  val detectedOption: String?,
  val detectedLabel: String?,
  val confidenceScore: Double,
  val detectionStatus: String,
  val markedOptions: List<String>,
  val optionScores: Map<String, Double>,
  val scoreGap: Double,
)

data class DynamicWrittenEvidence(
  val regionUuid: String,
  val questionId: Long,
  val questionUuid: String,
  val itemNumber: Int,
  val questionType: String,
  val evidenceImageUri: String,
  val evidenceSha256: String,
  val enhancedImageUri: String,
  val enhancementMethod: String,
  val evaluationStatus: String,
)

data class DynamicMarkerCheck(
  val corner: String,
  val style: String,
  val centerDarkness: Double,
)

data class DynamicScanQuality(
  val focusScore: Double,
  val meanBrightness: Double,
  val shadowPercent: Double,
  val highlightPercent: Double,
  val illuminationRange: Double,
  val pageCoveragePercent: Double,
  val perspectiveSkewPercent: Double,
  val warnings: List<String>,
)

data class DynamicScanTimings(
  val qrDecodeMs: Long,
  val alignmentMs: Long,
  val analysisMs: Long,
  val totalMs: Long,
)

data class DynamicOmrScanResult(
  val scannerVersion: String,
  val manifestHash: String,
  val paperSize: String,
  val sourceImageUri: String,
  val alignedImageUri: String,
  val annotatedImageUri: String,
  val originalPageSha256: String,
  // The copy that is uploaded as the page's original_page image: the same
  // capture, downscaled (see writeUploadCopy). Its hash covers these exact bytes.
  val uploadImageUri: String,
  val uploadImageSha256: String,
  val uploadImageWidthPx: Int,
  val uploadImageHeightPx: Int,
  val alignmentMethod: String,
  val inputRotationDegreesClockwise: Int,
  val identity: DynamicOmrSheetIdentity,
  val markerChecks: List<DynamicMarkerCheck>,
  val objectiveDetections: List<DynamicOmrDetection>,
  val writtenEvidence: List<DynamicWrittenEvidence>,
  val quality: DynamicScanQuality,
  val timings: DynamicScanTimings,
)

object DynamicOmrDetector {
  const val SCANNER_VERSION = "3.0.0-prototype.2-android-test.2"

  private const val REQUIRED_MANIFEST_SCANNER_VERSION = "3.0.0-prototype.2"
  private const val DESIGN_SYSTEM_CODE = "SMART-DYNAMIC-ANSWER-SHEET"
  private const val MANIFEST_VERSION = 2
  private const val WARP_SCALE = 2.0
  private const val BUBBLE_RADIUS_PT = 6.4
  private const val MARK_THRESHOLD = 0.75
  private const val POSSIBLE_MARK_THRESHOLD = 0.30
  private const val LOCAL_DARKNESS_DELTA = 22.0
  private const val MAX_CENTER_SNAP_DISTANCE = 28.0
  private const val MAX_INPUT_DIMENSION = 2600.0
  private const val MAX_QR_ROI_DIMENSION = 1400.0
  // A tighter, higher-resolution fallback crop. The printed QR footer is a small
  // corner of the full page; a 55%-of-frame search crop keeps enough margin for
  // imprecise framing but loses too much effective pixel density on the QR itself
  // once downscaled to MAX_QR_ROI_DIMENSION. This second pass zooms in further and
  // is allowed a higher resolution cap in exchange, since the cropped area is much
  // smaller to begin with.
  private const val TIGHT_QR_CROP_FRACTION = 0.30
  private const val MAX_QR_ROI_DIMENSION_TIGHT = 2000.0
  private const val MAX_QUALITY_DIMENSION = 1200.0
  // Uploaded page copy only - detection above still reads the full capture.
  // 1600 px on the longest edge keeps handwriting readable for teachers at
  // about 200-400 KB, instead of ~2.4 MB at 3072x4096 (slow on free hosting).
  private const val UPLOAD_MAX_DIMENSION = 1600.0
  private const val UPLOAD_JPEG_QUALITY = 80
  // Registration-marker fallback binarization: a single global Otsu threshold (the
  // first attempt, unchanged) can fail across a page with an uneven light source or
  // a phone-cast shadow, since one corner ends up on the wrong side of that one
  // global cutoff. adaptiveThreshold recomputes a local cutoff per neighborhood, so
  // it survives exactly that failure mode; blockSize must stay odd per OpenCV's
  // contract. The shadow-corrected Otsu pass mirrors the same divide-by-blurred-
  // background technique already used for written-response evidence, applied here
  // to the whole page before a second, cleaner global threshold.
  private const val MARKER_ADAPTIVE_BLOCK_SIZE = 35
  private const val MARKER_ADAPTIVE_C = 10.0
  private const val MARKER_SHADOW_BLUR_SIGMA = 25.0
  // Whole-page document-boundary pre-pass (see straightenDocumentIfFound). The page
  // must cover a large share of the frame for its contour to be trusted as "the
  // page" rather than some other object/shadow edge in the shot.
  private const val DOCUMENT_QUAD_MIN_AREA_FRACTION = 0.25
  private const val DOCUMENT_SHADOW_BLUR_SIGMA = 31.0

  private val manifestAssets = mapOf(
    "OMR-A4-DYNAMIC-CTX-V3" to "omr/dynamic/v3_dynamic_mixed_a4_manifest.json",
    "OMR-US-LETTER-DYNAMIC-CTX-V3" to
      "omr/dynamic/v3_dynamic_mixed_us_letter_manifest.json",
    "OMR-US-LEGAL-DYNAMIC-CTX-V3" to
      "omr/dynamic/v3_dynamic_mixed_us_legal_manifest.json",
  )

  private data class Marker(
    val corner: String,
    val style: String,
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
  )

  private data class Option(
    val key: String,
    val storedValue: String,
    val centerX: Double,
    val centerY: Double,
  )

  private data class Region(
    val regionUuid: String,
    val questionId: Long,
    val questionUuid: String,
    val itemNumber: Int,
    val questionType: String,
    val regionType: String,
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
    val options: List<Option>,
  )

  private data class Page(
    val pageUuid: String,
    val pageNumber: Int,
    val totalPages: Int,
    val templateCode: String,
    val templateVersion: String,
    val geometryHash: String,
    val qrPayload: String,
    val widthPt: Double,
    val heightPt: Double,
    val markers: List<Marker>,
    val regions: List<Region>,
  )

  private data class Manifest(
    val manifestHash: String,
    val answerSheetUuid: String,
    val assignmentUuid: String,
    val paperSize: String,
    val totalPages: Int,
    val pages: List<Page>,
  )

  private data class DecodedQr(
    val raw: String,
    val json: JSONObject,
    val rotationDegreesClockwise: Int,
  )

  private data class QrCandidate(
    val rectangle: Rect,
    val rotationDegreesClockwise: Int,
  )

  private data class QrSearchPass(
    val cropFraction: Double,
    val maxDimension: Double,
  )

  private data class InputQuality(
    val focusScore: Double,
    val meanBrightness: Double,
    val shadowPercent: Double,
    val highlightPercent: Double,
    val illuminationRange: Double,
  )

  private data class PageGeometryQuality(
    val coveragePercent: Double,
    val perspectiveSkewPercent: Double,
  )

  private data class ClassifiedMark(
    val detectedOption: String?,
    val status: String,
    val markedOptions: List<String>,
    val confidence: Double,
    val scoreGap: Double,
  )

  private data class PrintedCircle(
    val x: Double,
    val y: Double,
    val radius: Double,
  )

  fun detect(
    context: Context,
    imageFile: File,
    expectedAnswerSheetUuid: String?,
    expectedAssignmentUuid: String?,
    // A manifest fetched from the backend for a specific assignment/answer-sheet
    // (see src/services/v3/mobileReadClient.ts). When supplied, this is parsed and
    // used directly instead of looking up one of the 3 bundled asset files by the
    // QR's template code - the QR/geometry-hash self-consistency check in
    // validateIdentity() still applies exactly as before, so a mismatched or stale
    // fetched manifest is still rejected, not silently trusted.
    overrideManifestJson: String? = null,
  ): DynamicOmrScanResult {
    val totalStartedAt = SystemClock.elapsedRealtime()
    check(OpenCVLoader.initLocal()) { "OpenCV could not be initialized on this device." }

    val loadedFromDisk = Imgcodecs.imread(imageFile.absolutePath, Imgcodecs.IMREAD_COLOR)
    require(!loadedFromDisk.empty()) { "The captured image could not be decoded." }
    // Document-scanner-style pre-pass, run once before anything else touches the
    // photo: find the page's own outer edge against whatever it was photographed
    // on, warp it flat to fill the frame, and flatten shadows/uneven lighting.
    // QR decode's corner search and findAlignmentMarkers's percentage-of-frame
    // corner zones both assume the page already roughly fills the frame evenly lit;
    // this is what makes that assumption hold for an imprecisely framed or badly
    // lit photo instead of just the raw camera capture. Falls back to the original
    // photo untouched if no confident page boundary is found, so this can only
    // ever help, never regress a photo that already decodes fine as-is.
    val decoded = runCatching { straightenDocumentIfFound(loadedFromDisk) }.getOrDefault(loadedFromDisk)

    var source: Mat? = null
    var oriented: Mat? = null
    var aligned: Mat? = null
    try {
      val inputQuality = measureInputQuality(decoded)
      val qrStartedAt = SystemClock.elapsedRealtime()
      val decodedQr = decodeQrWithOrientation(decoded, inputQuality)
      val qrDecodeMs = SystemClock.elapsedRealtime() - qrStartedAt

      val processingSource = downscaleIfNeeded(decoded)
      source = processingSource
      oriented = rotateClockwise(processingSource, decodedQr.rotationDegreesClockwise)
      val templateCode = decodedQr.json.getString("tc")
      val manifest = loadManifest(context, templateCode, overrideManifestJson)
      val page = validateIdentity(
        decodedQr.raw,
        decodedQr.json,
        manifest,
        expectedAnswerSheetUuid,
        expectedAssignmentUuid,
      )

      val alignmentStartedAt = SystemClock.elapsedRealtime()
      val markerCenters = findAlignmentMarkers(oriented)
        ?: throw IllegalArgumentException(
          "Four registration markers were not found. Keep the entire page visible and flat.",
        )
      val pageGeometryQuality = measurePageGeometry(markerCenters, oriented)
      aligned = alignFromMarkers(oriented, markerCenters, page)
      val markerChecks = validateMarkerPattern(aligned, page)
      val alignmentMs = SystemClock.elapsedRealtime() - alignmentStartedAt
      val analysisStartedAt = SystemClock.elapsedRealtime()
      val outputRoot = File(requireNotNull(imageFile.parentFile), "dynamic_${System.currentTimeMillis()}")
      require(outputRoot.exists() || outputRoot.mkdirs()) {
        "Unable to create the dynamic scan evidence directory."
      }

      val alignedFile = File(outputRoot, "page-${page.pageNumber.toString().padStart(2, '0')}-aligned.png")
      require(Imgcodecs.imwrite(alignedFile.absolutePath, aligned)) {
        "Unable to save the aligned page."
      }

      val detections = mutableListOf<DynamicOmrDetection>()
      val writtenEvidence = mutableListOf<DynamicWrittenEvidence>()
      val overlay = aligned.clone()
      val gray = Mat()
      val blurred = Mat()
      try {
        Imgproc.cvtColor(aligned, gray, Imgproc.COLOR_BGR2GRAY)
        Imgproc.GaussianBlur(gray, blurred, Size(3.0, 3.0), 0.0)
        val printedCircles = findPrintedBubbles(gray)

        page.regions.forEach { region ->
          if (region.regionType == "objective_bubbles") {
            val scoredOptions = linkedMapOf<Option, Double>()
            val snappedCenters = linkedMapOf<Option, Point>()
            region.options.forEach { option ->
              val expectedCenter = pointToPixel(
                option.centerX,
                option.centerY,
                page.widthPt,
                page.heightPt,
                aligned,
              )
              val expectedRadius = max(
                4,
                (BUBBLE_RADIUS_PT * aligned.cols() / page.widthPt).roundToInt(),
              )
              val snapped = snapToPrintedBubble(
                printedCircles,
                expectedCenter.x,
                expectedCenter.y,
                expectedRadius,
              )
              scoredOptions[option] = round4(
                bubbleDarkness(
                  blurred,
                  snapped.first.x.roundToInt(),
                  snapped.first.y.roundToInt(),
                  snapped.second,
                ),
              )
              snappedCenters[option] = snapped.first
            }

            val scoresByStoredValue = linkedMapOf<String, Double>()
            scoredOptions.forEach { (option, score) -> scoresByStoredValue[option.storedValue] = score }
            val mark = classify(scoresByStoredValue)
            val selected = region.options.firstOrNull { it.storedValue == mark.detectedOption }
            detections += DynamicOmrDetection(
              regionUuid = region.regionUuid,
              questionId = region.questionId,
              questionUuid = region.questionUuid,
              itemNumber = region.itemNumber,
              questionType = region.questionType,
              detectedOption = mark.detectedOption,
              detectedLabel = selected?.key,
              confidenceScore = mark.confidence,
              detectionStatus = mark.status,
              markedOptions = mark.markedOptions,
              optionScores = scoresByStoredValue,
              scoreGap = mark.scoreGap,
            )

            region.options.forEach { option ->
              val center = requireNotNull(snappedCenters[option])
              val highlighted = mark.markedOptions.contains(option.storedValue)
              val color = when (mark.status) {
                "detected" -> Scalar(40.0, 190.0, 60.0)
                "multiple_marks" -> Scalar(45.0, 45.0, 230.0)
                "uncertain" -> Scalar(0.0, 165.0, 255.0)
                else -> Scalar(150.0, 150.0, 150.0)
              }
              Imgproc.circle(
                overlay,
                center,
                max(8, (BUBBLE_RADIUS_PT * aligned.cols() / page.widthPt).roundToInt() + 4),
                if (highlighted) color else Scalar(180.0, 180.0, 180.0),
                if (highlighted) 3 else 1,
              )
            }
          } else {
            val crop = cropRegion(aligned, region, page)
            val enhancedCrop = enhanceWrittenResponse(crop)
            try {
              val cropFile = File(
                outputRoot,
                "page-${page.pageNumber.toString().padStart(2, '0')}-question-" +
                  "${region.itemNumber.toString().padStart(3, '0')}-${region.questionType}.png",
              )
              require(Imgcodecs.imwrite(cropFile.absolutePath, crop)) {
                "Unable to save the written-response crop for item ${region.itemNumber}."
              }
              val enhancedFile = File(
                outputRoot,
                "page-${page.pageNumber.toString().padStart(2, '0')}-question-" +
                  "${region.itemNumber.toString().padStart(3, '0')}-${region.questionType}-enhanced.png",
              )
              require(Imgcodecs.imwrite(enhancedFile.absolutePath, enhancedCrop)) {
                "Unable to save the enhanced written-response preview for item ${region.itemNumber}."
              }
              writtenEvidence += DynamicWrittenEvidence(
                regionUuid = region.regionUuid,
                questionId = region.questionId,
                questionUuid = region.questionUuid,
                itemNumber = region.itemNumber,
                questionType = region.questionType,
                evidenceImageUri = Uri.fromFile(cropFile).toString(),
                evidenceSha256 = sha256(cropFile),
                enhancedImageUri = Uri.fromFile(enhancedFile).toString(),
                enhancementMethod = "illumination_normalization_clahe_unsharp",
                evaluationStatus = "needs_manual_scoring",
              )
            } finally {
              enhancedCrop.release()
              crop.release()
            }

            val topLeft = pointToPixel(
              region.x,
              region.y + region.height,
              page.widthPt,
              page.heightPt,
              aligned,
            )
            val bottomRight = pointToPixel(
              region.x + region.width,
              region.y,
              page.widthPt,
              page.heightPt,
              aligned,
            )
            Imgproc.rectangle(overlay, topLeft, bottomRight, Scalar(180.0, 100.0, 0.0), 2)
          }
        }

        val annotatedFile = File(
          outputRoot,
          "page-${page.pageNumber.toString().padStart(2, '0')}-review-overlay.png",
        )
        require(Imgcodecs.imwrite(annotatedFile.absolutePath, overlay)) {
          "Unable to save the review overlay."
        }

        val identity = DynamicOmrSheetIdentity(
          payloadVersion = decodedQr.json.getInt("v"),
          answerSheetUuid = manifest.answerSheetUuid,
          pageUuid = page.pageUuid,
          assignmentUuid = manifest.assignmentUuid,
          pageNumber = page.pageNumber,
          totalPages = page.totalPages,
          templateCode = page.templateCode,
          templateVersion = page.templateVersion,
          geometryHash = page.geometryHash,
        )
        val originalPageSha256 = sha256(imageFile)
        val uploadFile = File(
          outputRoot,
          "page-${page.pageNumber.toString().padStart(2, '0')}-upload.jpg",
        )
        val uploadSize = writeUploadCopy(loadedFromDisk, uploadFile)
        val uploadImageSha256 = sha256(uploadFile)
        val analysisMs = SystemClock.elapsedRealtime() - analysisStartedAt
        val quality = buildScanQuality(inputQuality, pageGeometryQuality)
        val totalMs = SystemClock.elapsedRealtime() - totalStartedAt
        return DynamicOmrScanResult(
          scannerVersion = SCANNER_VERSION,
          manifestHash = manifest.manifestHash,
          paperSize = manifest.paperSize,
          sourceImageUri = Uri.fromFile(imageFile).toString(),
          alignedImageUri = Uri.fromFile(alignedFile).toString(),
          annotatedImageUri = Uri.fromFile(annotatedFile).toString(),
          originalPageSha256 = originalPageSha256,
          uploadImageUri = Uri.fromFile(uploadFile).toString(),
          uploadImageSha256 = uploadImageSha256,
          uploadImageWidthPx = uploadSize.first,
          uploadImageHeightPx = uploadSize.second,
          alignmentMethod = "four_corner_markers",
          inputRotationDegreesClockwise = decodedQr.rotationDegreesClockwise,
          identity = identity,
          markerChecks = markerChecks,
          objectiveDetections = detections,
          writtenEvidence = writtenEvidence,
          quality = quality,
          timings = DynamicScanTimings(
            qrDecodeMs = qrDecodeMs,
            alignmentMs = alignmentMs,
            analysisMs = analysisMs,
            totalMs = totalMs,
          ),
        )
      } finally {
        gray.release()
        blurred.release()
        overlay.release()
      }
    } finally {
      aligned?.release()
      oriented?.release()
      source?.let { processingSource ->
        if (processingSource !== decoded) processingSource.release()
      }
      decoded.release()
      if (decoded !== loadedFromDisk) loadedFromDisk.release()
    }
  }

  private fun loadManifest(
    context: Context,
    templateCode: String,
    overrideManifestJson: String?,
  ): Manifest {
    val raw = overrideManifestJson ?: run {
      val asset = manifestAssets[templateCode]
        ?: throw IllegalArgumentException("Unsupported dynamic template: $templateCode")
      context.assets.open(asset).bufferedReader().use { it.readText() }
    }
    return parseManifest(raw)
  }

  private fun parseManifest(raw: String): Manifest {
    val json = JSONObject(raw)
    require(json.getString("contractVersion") == "3.0") {
      "Dynamic manifest contractVersion is not supported."
    }
    require(json.getInt("manifestVersion") == MANIFEST_VERSION) {
      "Dynamic manifest version is not supported."
    }
    val designSystem = json.getJSONObject("designSystem")
    require(designSystem.getString("code") == DESIGN_SYSTEM_CODE) {
      "Dynamic manifest design system is not supported."
    }
    require(designSystem.getBoolean("nativePaperGeometry")) {
      "Dynamic manifest must use native paper geometry."
    }
    require(json.getString("requiredScannerVersion") == REQUIRED_MANIFEST_SCANNER_VERSION) {
      "Dynamic manifest requires a different scanner version."
    }

    val paperSizeJson = json.getJSONObject("paperSize")
    val pageWidth = paperSizeJson.getDouble("widthPt")
    val pageHeight = paperSizeJson.getDouble("heightPt")
    val pagesJson = json.getJSONArray("pages")
    val pages = (0 until pagesJson.length()).map { pageIndex ->
      val pageJson = pagesJson.getJSONObject(pageIndex)
      val coordinateSpace = pageJson.getJSONObject("coordinateSpace")
      require(coordinateSpace.getString("unit") == "pt") {
        "Dynamic scanner requires point-based coordinates."
      }
      require(coordinateSpace.getString("origin") == "pdf_bottom_left") {
        "Dynamic scanner requires a PDF bottom-left coordinate origin."
      }
      require(closeEnough(coordinateSpace.getDouble("width"), pageWidth)) {
        "Manifest page width does not match its paper profile."
      }
      require(closeEnough(coordinateSpace.getDouble("height"), pageHeight)) {
        "Manifest page height does not match its paper profile."
      }

      val markersJson = pageJson.getJSONArray("registrationMarkers")
      require(markersJson.length() == 4) { "Every dynamic page requires four markers." }
      val markers = (0 until markersJson.length()).map { markerIndex ->
        val markerJson = markersJson.getJSONObject(markerIndex)
        val rectangle = markerJson.getJSONObject("rectangle")
        Marker(
          corner = markerJson.getString("corner"),
          style = markerJson.getString("style"),
          x = rectangle.getDouble("x"),
          y = rectangle.getDouble("y"),
          width = rectangle.getDouble("width"),
          height = rectangle.getDouble("height"),
        )
      }
      require(markers.map { it.corner } == listOf(
        "top_left",
        "top_right",
        "bottom_right",
        "bottom_left",
      )) { "Dynamic marker order is invalid." }
      require(markers.map { it.style } == listOf("hollow", "solid", "solid", "solid")) {
        "Dynamic marker orientation pattern is invalid."
      }

      val regionsJson = pageJson.getJSONArray("regions")
      val regions = (0 until regionsJson.length()).map { regionIndex ->
        val regionJson = regionsJson.getJSONObject(regionIndex)
        val rectangle = regionJson.getJSONObject("rectangle")
        val optionsJson = regionJson.optJSONArray("options") ?: JSONArray()
        Region(
          regionUuid = regionJson.getString("regionUuid"),
          questionId = regionJson.getLong("questionId"),
          questionUuid = regionJson.getString("questionUuid"),
          itemNumber = regionJson.getInt("globalItemNumber"),
          questionType = regionJson.getString("questionType"),
          regionType = regionJson.getString("regionType"),
          x = rectangle.getDouble("x"),
          y = rectangle.getDouble("y"),
          width = rectangle.getDouble("width"),
          height = rectangle.getDouble("height"),
          options = (0 until optionsJson.length()).map { optionIndex ->
            val optionJson = optionsJson.getJSONObject(optionIndex)
            Option(
              key = optionJson.getString("key"),
              storedValue = optionJson.getString("storedValue"),
              centerX = optionJson.getDouble("centerX"),
              centerY = optionJson.getDouble("centerY"),
            )
          },
        )
      }

      val template = pageJson.getJSONObject("template")
      Page(
        pageUuid = pageJson.getString("pageUuid"),
        pageNumber = pageJson.getInt("pageNumber"),
        totalPages = pageJson.getInt("totalPages"),
        templateCode = template.getString("code"),
        templateVersion = template.get("version").toString(),
        geometryHash = template.getString("geometryHash"),
        qrPayload = pageJson.getJSONObject("qr").getString("payload"),
        widthPt = coordinateSpace.getDouble("width"),
        heightPt = coordinateSpace.getDouble("height"),
        markers = markers,
        regions = regions,
      )
    }

    require(json.getInt("totalPages") == pages.size) {
      "Dynamic manifest totalPages does not match its pages."
    }
    require(pages.all { it.totalPages == pages.size }) {
      "Dynamic manifest page counts are inconsistent."
    }
    return Manifest(
      manifestHash = json.getString("manifestHash"),
      answerSheetUuid = json.getString("answerSheetUuid"),
      assignmentUuid = json.getJSONObject("testAssignment").getString("assignmentUuid"),
      paperSize = paperSizeJson.getString("code"),
      totalPages = json.getInt("totalPages"),
      pages = pages,
    )
  }

  private fun validateIdentity(
    rawPayload: String,
    payload: JSONObject,
    manifest: Manifest,
    expectedAnswerSheetUuid: String?,
    expectedAssignmentUuid: String?,
  ): Page {
    require(payload.getInt("v") == 3) { "Dynamic QR payload version must be 3." }
    require(payload.length() == 9) { "Dynamic QR must contain the nine approved fields." }
    val answerSheetUuid = decodeCompactUuid(payload.getString("as"))
    val pageUuid = decodeCompactUuid(payload.getString("pg"))
    val assignmentUuid = decodeCompactUuid(payload.getString("ta"))
    require(answerSheetUuid == manifest.answerSheetUuid) {
      "QR answer-sheet identity does not match the bundled manifest."
    }
    require(assignmentUuid == manifest.assignmentUuid) {
      "QR assignment identity does not match the bundled manifest."
    }
    if (!expectedAnswerSheetUuid.isNullOrBlank()) {
      require(answerSheetUuid == expectedAnswerSheetUuid) {
        "Scanned page does not match the selected answer sheet."
      }
    }
    if (!expectedAssignmentUuid.isNullOrBlank()) {
      require(assignmentUuid == expectedAssignmentUuid) {
        "Scanned page does not match the selected assignment."
      }
    }
    require(payload.getInt("pc") == manifest.totalPages) {
      "QR page count does not match the manifest."
    }
    val page = manifest.pages.firstOrNull { it.pageNumber == payload.getInt("pn") }
      ?: throw IllegalArgumentException("QR page number is not present in the manifest.")
    require(page.pageUuid == pageUuid) { "QR page identity does not match the manifest." }
    require(page.templateCode == payload.getString("tc")) {
      "QR template code does not match the manifest."
    }
    require(page.templateVersion == payload.get("tv").toString()) {
      "QR template version does not match the manifest."
    }
    require(encodeGeometryHash(page.geometryHash) == payload.getString("gh")) {
      "QR geometry hash does not match the manifest."
    }
    require(page.qrPayload == rawPayload) {
      "QR payload does not exactly match the bundled manifest page."
    }
    return page
  }

  private fun decodeQrWithOrientation(source: Mat, quality: InputQuality): DecodedQr {
    // First pass: existing wide corner crop, generous margin for imprecise framing.
    // Second pass: tighter crop at a higher resolution cap, recovering legibility on
    // phones/framing where the printed QR ends up small relative to the full page.
    val passes = listOf(
      QrSearchPass(cropFraction = 0.55, maxDimension = MAX_QR_ROI_DIMENSION),
      QrSearchPass(cropFraction = TIGHT_QR_CROP_FRACTION, maxDimension = MAX_QR_ROI_DIMENSION_TIGHT),
    )

    passes.forEach { pass ->
      val cropWidth = max(1, (source.cols() * pass.cropFraction).roundToInt())
      val cropHeight = max(1, (source.rows() * pass.cropFraction).roundToInt())
      val candidates = listOf(
        QrCandidate(
          Rect(source.cols() - cropWidth, source.rows() - cropHeight, cropWidth, cropHeight),
          0,
        ),
        QrCandidate(Rect(0, source.rows() - cropHeight, cropWidth, cropHeight), 270),
        QrCandidate(Rect(0, 0, cropWidth, cropHeight), 180),
        QrCandidate(Rect(source.cols() - cropWidth, 0, cropWidth, cropHeight), 90),
      )

      candidates.forEach { candidate ->
        val crop = source.submat(candidate.rectangle)
        val capped = resizeForQr(crop, pass.maxDimension)
        val gray = Mat()
        val upscaled2x = Mat()
        val upscaled3x = Mat()
        try {
          Imgproc.cvtColor(capped, gray, Imgproc.COLOR_BGR2GRAY)
          // Matches the validated Python reference (scan_dynamic_answer_sheet.py's
          // decode_qr_text_from_footer): try the crop as captured, then 2x and 3x
          // cubic-upscaled grayscale versions. A small printed QR can be too fine for
          // the decoder's internal sampling grid even when well within any resolution
          // cap - explicit upscaling, not just avoiding downscale, is what recovers it.
          Imgproc.resize(gray, upscaled2x, Size(), 2.0, 2.0, Imgproc.INTER_CUBIC)
          Imgproc.resize(gray, upscaled3x, Size(), 3.0, 3.0, Imgproc.INTER_CUBIC)

          for (variant in listOf(capped, upscaled2x, upscaled3x)) {
            val raw = decodeQrWithZxing(variant) ?: decodeQrWithOpenCv(variant)
            if (!raw.isNullOrBlank()) {
              val parsed = runCatching { JSONObject(raw) }.getOrNull()
              if (parsed != null && parsed.optInt("v") == 3 && parsed.has("tc")) {
                return DecodedQr(raw, parsed, candidate.rotationDegreesClockwise)
              }
            }
          }
        } finally {
          upscaled3x.release()
          upscaled2x.release()
          gray.release()
          capped.release()
          crop.release()
        }
      }
    }

    val qualityHint = when {
      quality.focusScore < 70.0 -> "The photo is blurred; hold steady and focus on the QR."
      quality.meanBrightness < 70.0 -> "The page is too dark; add even light without casting a shadow."
      quality.highlightPercent > 18.0 -> "The page has strong glare; move the light or phone slightly."
      quality.illuminationRange > 85.0 -> "Lighting is uneven across the page."
      else -> "Move closer while keeping all four page markers visible."
    }
    throw IllegalArgumentException(
      "Dynamic page QR could not be decoded. $qualityHint " +
        "Focus ${round1(quality.focusScore)}, brightness ${round1(quality.meanBrightness)}.",
    )
  }

  private fun resizeForQr(image: Mat, maxDimension: Double): Mat {
    val largestDimension = max(image.cols(), image.rows()).toDouble()
    if (largestDimension <= maxDimension) return image.clone()
    val scale = maxDimension / largestDimension
    return Mat().also { resized ->
      Imgproc.resize(
        image,
        resized,
        Size(image.cols() * scale, image.rows() * scale),
        0.0,
        0.0,
        Imgproc.INTER_AREA,
      )
    }
  }

  private fun decodeQrWithZxing(image: Mat): String? {
    val gray = Mat()
    try {
      if (image.channels() == 1) {
        image.copyTo(gray)
      } else {
        Imgproc.cvtColor(image, gray, Imgproc.COLOR_BGR2GRAY)
      }
      val pixels = ByteArray((gray.total() * gray.channels()).toInt())
      gray.get(0, 0, pixels)
      val luminance = PlanarYUVLuminanceSource(
        pixels,
        gray.cols(),
        gray.rows(),
        0,
        0,
        gray.cols(),
        gray.rows(),
        false,
      )
      val bitmap = BinaryBitmap(HybridBinarizer(luminance))
      val hints = EnumMap<DecodeHintType, Any>(DecodeHintType::class.java).apply {
        put(DecodeHintType.POSSIBLE_FORMATS, listOf(BarcodeFormat.QR_CODE))
        put(DecodeHintType.TRY_HARDER, true)
        put(DecodeHintType.ALSO_INVERTED, true)
        put(DecodeHintType.CHARACTER_SET, "UTF-8")
      }
      return runCatching {
        MultiFormatReader().decode(bitmap, hints).text.trim().ifBlank { null }
      }.getOrNull()
    } finally {
      gray.release()
    }
  }

  private fun decodeQrWithOpenCv(image: Mat): String? {
    val detector = QRCodeDetector()
    decodeQr(detector, image)?.let { return it }

    val gray = Mat()
    val normalized = Mat()
    val threshold = Mat()
    val clahe = Imgproc.createCLAHE(2.0, Size(8.0, 8.0))
    try {
      // image is sometimes already single-channel here: the caller's multi-scale QR
      // search feeds this the same grayscale 2x/3x-upscaled Mats it also hands to
      // decodeQrWithZxing, not just the original color crop. COLOR_BGR2GRAY throws
      // ("Bad number of channels") on a 1-channel source, so this must branch the
      // same way decodeQrWithZxing already does below.
      if (image.channels() == 1) {
        image.copyTo(gray)
      } else {
        Imgproc.cvtColor(image, gray, Imgproc.COLOR_BGR2GRAY)
      }
      clahe.apply(gray, normalized)
      decodeQr(detector, normalized)?.let { return it }
      Imgproc.threshold(
        normalized,
        threshold,
        0.0,
        255.0,
        Imgproc.THRESH_BINARY or Imgproc.THRESH_OTSU,
      )
      decodeQr(detector, threshold)?.let { return it }

      // Last resort: explicit shadow removal (divide by a heavily blurred copy of the
      // same crop) before a fresh Otsu pass. CLAHE above redistributes contrast but
      // still fails when a phone-cast shadow makes one side of the QR footer much
      // darker than the other - dividing out the blurred background evens that
      // gradient before thresholding, the same technique used elsewhere for
      // written-response evidence and registration-marker detection.
      val background = Mat()
      val shadowCorrected = Mat()
      val shadowThreshold = Mat()
      try {
        Imgproc.GaussianBlur(gray, background, Size(0.0, 0.0), 21.0)
        Core.divide(gray, background, shadowCorrected, 255.0)
        Imgproc.threshold(
          shadowCorrected,
          shadowThreshold,
          0.0,
          255.0,
          Imgproc.THRESH_BINARY or Imgproc.THRESH_OTSU,
        )
        return decodeQr(detector, shadowThreshold)
      } finally {
        background.release()
        shadowCorrected.release()
        shadowThreshold.release()
      }
    } finally {
      clahe.collectGarbage()
      gray.release()
      normalized.release()
      threshold.release()
    }
  }

  private fun decodeQr(detector: QRCodeDetector, image: Mat): String? =
    runCatching { detector.detectAndDecode(image).trim().ifBlank { null } }.getOrNull()

  private fun rotateClockwise(source: Mat, degrees: Int): Mat = Mat().also { target ->
    when (degrees) {
      0 -> source.copyTo(target)
      90 -> Core.rotate(source, target, Core.ROTATE_90_CLOCKWISE)
      180 -> Core.rotate(source, target, Core.ROTATE_180)
      270 -> Core.rotate(source, target, Core.ROTATE_90_COUNTERCLOCKWISE)
      else -> error("Unsupported rotation: $degrees")
    }
  }

  /**
   * Writes the capture as a JPEG no larger than UPLOAD_MAX_DIMENSION on its
   * longest edge, once, at scan time. The file is never rewritten afterwards,
   * so the hash stored with a queued result keeps matching the bytes it uploads.
   */
  private fun writeUploadCopy(capture: Mat, target: File): Pair<Int, Int> {
    val largestDimension = max(capture.cols(), capture.rows()).toDouble()
    val resized = if (largestDimension > UPLOAD_MAX_DIMENSION) {
      val scale = UPLOAD_MAX_DIMENSION / largestDimension
      Mat().also { output ->
        Imgproc.resize(
          capture,
          output,
          Size(
            (capture.cols() * scale).roundToInt().toDouble(),
            (capture.rows() * scale).roundToInt().toDouble(),
          ),
          0.0,
          0.0,
          Imgproc.INTER_AREA,
        )
      }
    } else {
      capture
    }
    try {
      require(
        Imgcodecs.imwrite(
          target.absolutePath,
          resized,
          MatOfInt(Imgcodecs.IMWRITE_JPEG_QUALITY, UPLOAD_JPEG_QUALITY),
        ),
      ) { "Unable to save the page image for upload." }
      return resized.cols() to resized.rows()
    } finally {
      if (resized !== capture) resized.release()
    }
  }

  private fun downscaleIfNeeded(image: Mat): Mat {
    val largestDimension = max(image.cols(), image.rows()).toDouble()
    if (largestDimension <= MAX_INPUT_DIMENSION) {
      return image
    }
    val scale = MAX_INPUT_DIMENSION / largestDimension
    return Mat().also { resized ->
      Imgproc.resize(
        image,
        resized,
        Size(image.cols() * scale, image.rows() * scale),
        0.0,
        0.0,
        Imgproc.INTER_AREA,
      )
    }
  }

  private fun measureInputQuality(image: Mat): InputQuality {
    val sample = resizeForQuality(image)
    val gray = Mat()
    val laplacian = Mat()
    val darkMask = Mat()
    val brightMask = Mat()
    val mean = MatOfDouble()
    val standardDeviation = MatOfDouble()
    try {
      Imgproc.cvtColor(sample, gray, Imgproc.COLOR_BGR2GRAY)
      Imgproc.Laplacian(gray, laplacian, CvType.CV_64F)
      Core.meanStdDev(laplacian, mean, standardDeviation)
      val focusScore = standardDeviation.toArray().firstOrNull()?.let { it * it } ?: 0.0
      val meanBrightness = Core.mean(gray).`val`[0]

      Imgproc.threshold(gray, darkMask, 45.0, 255.0, Imgproc.THRESH_BINARY_INV)
      Imgproc.threshold(gray, brightMask, 245.0, 255.0, Imgproc.THRESH_BINARY)
      val totalPixels = max(1.0, gray.total().toDouble())
      val shadowPercent = Core.countNonZero(darkMask) * 100.0 / totalPixels
      val highlightPercent = Core.countNonZero(brightMask) * 100.0 / totalPixels

      val tileMeans = mutableListOf<Double>()
      val rows = 4
      val columns = 4
      for (row in 0 until rows) {
        for (column in 0 until columns) {
          val left = column * gray.cols() / columns
          val right = (column + 1) * gray.cols() / columns
          val top = row * gray.rows() / rows
          val bottom = (row + 1) * gray.rows() / rows
          val tile = gray.submat(Rect(left, top, right - left, bottom - top))
          try {
            tileMeans += Core.mean(tile).`val`[0]
          } finally {
            tile.release()
          }
        }
      }
      val illuminationRange = (tileMeans.maxOrNull() ?: 0.0) - (tileMeans.minOrNull() ?: 0.0)
      return InputQuality(
        focusScore = round1(focusScore),
        meanBrightness = round1(meanBrightness),
        shadowPercent = round1(shadowPercent),
        highlightPercent = round1(highlightPercent),
        illuminationRange = round1(illuminationRange),
      )
    } finally {
      sample.release()
      gray.release()
      laplacian.release()
      darkMask.release()
      brightMask.release()
      mean.release()
      standardDeviation.release()
    }
  }

  private fun resizeForQuality(image: Mat): Mat {
    val largestDimension = max(image.cols(), image.rows()).toDouble()
    if (largestDimension <= MAX_QUALITY_DIMENSION) return image.clone()
    val scale = MAX_QUALITY_DIMENSION / largestDimension
    return Mat().also { resized ->
      Imgproc.resize(
        image,
        resized,
        Size(image.cols() * scale, image.rows() * scale),
        0.0,
        0.0,
        Imgproc.INTER_AREA,
      )
    }
  }

  private fun measurePageGeometry(
    markerCenters: List<Point>,
    image: Mat,
  ): PageGeometryQuality {
    require(markerCenters.size == 4) { "Four marker centers are required." }
    val polygon = MatOfPoint(*markerCenters.toTypedArray())
    try {
      val coverage = Imgproc.contourArea(polygon) * 100.0 /
        max(1.0, image.cols().toDouble() * image.rows().toDouble())
      val top = pointDistance(markerCenters[0], markerCenters[1])
      val right = pointDistance(markerCenters[1], markerCenters[2])
      val bottom = pointDistance(markerCenters[2], markerCenters[3])
      val left = pointDistance(markerCenters[3], markerCenters[0])
      val horizontalSkew = abs(top - bottom) * 100.0 / max(1.0, max(top, bottom))
      val verticalSkew = abs(left - right) * 100.0 / max(1.0, max(left, right))
      return PageGeometryQuality(
        coveragePercent = round1(coverage),
        perspectiveSkewPercent = round1(max(horizontalSkew, verticalSkew)),
      )
    } finally {
      polygon.release()
    }
  }

  private fun buildScanQuality(
    input: InputQuality,
    geometry: PageGeometryQuality,
  ): DynamicScanQuality {
    val warnings = mutableListOf<String>()
    if (input.focusScore < 70.0) warnings += "Low sharpness: hold the phone steady and focus on the page."
    if (input.meanBrightness < 70.0 || input.shadowPercent > 18.0) {
      warnings += "Dark areas detected: use brighter, even light without phone shadow."
    }
    if (input.meanBrightness > 220.0 || input.highlightPercent > 18.0) {
      warnings += "Glare detected: move the light source away from the paper reflection."
    }
    if (input.illuminationRange > 85.0) warnings += "Lighting is uneven across the page."
    if (geometry.coveragePercent < 42.0) warnings += "Page is too far away: move closer but keep all markers visible."
    if (geometry.perspectiveSkewPercent > 18.0) warnings += "Strong angle detected: hold the phone parallel to the page."
    return DynamicScanQuality(
      focusScore = input.focusScore,
      meanBrightness = input.meanBrightness,
      shadowPercent = input.shadowPercent,
      highlightPercent = input.highlightPercent,
      illuminationRange = input.illuminationRange,
      pageCoveragePercent = geometry.coveragePercent,
      perspectiveSkewPercent = geometry.perspectiveSkewPercent,
      warnings = warnings,
    )
  }

  private fun pointDistance(first: Point, second: Point): Double =
    hypot(first.x - second.x, first.y - second.y)

  /**
   * Whole-page document-boundary pre-pass, run once immediately after loading the
   * photo, before any QR or marker search. See the call site in detect() for why.
   * Returns the original Mat, untouched, if no confident page boundary is found.
   */
  private fun straightenDocumentIfFound(image: Mat): Mat {
    val quad = findDocumentQuad(image) ?: return image
    val warped = warpToQuad(image, quad)
    try {
      return removeShadowsPerChannel(warped)
    } finally {
      warped.release()
    }
  }

  /**
   * Finds the largest near-quadrilateral edge contour that covers a large enough
   * share of the frame to plausibly be the page itself (rather than a shadow, a
   * hand, or the registration markers, which are all far smaller). Returns its 4
   * corners in [topLeft, topRight, bottomRight, bottomLeft] order, or null if
   * nothing in the frame looks like a clean page boundary - this is expected (not
   * an error) whenever the page's background lacks enough contrast for Canny to
   * trace a closed edge around it, e.g. a white sheet photographed on a white desk.
   */
  private fun findDocumentQuad(image: Mat): Array<Point>? {
    val gray = Mat()
    val blurred = Mat()
    val edges = Mat()
    val dilated = Mat()
    val hierarchy = Mat()
    val contours = mutableListOf<MatOfPoint>()
    try {
      Imgproc.cvtColor(image, gray, Imgproc.COLOR_BGR2GRAY)
      Imgproc.GaussianBlur(gray, blurred, Size(5.0, 5.0), 0.0)
      Imgproc.Canny(blurred, edges, 50.0, 150.0)
      Imgproc.dilate(edges, dilated, Mat(), Point(-1.0, -1.0), 2)
      Imgproc.findContours(
        dilated,
        contours,
        hierarchy,
        Imgproc.RETR_EXTERNAL,
        Imgproc.CHAIN_APPROX_SIMPLE,
      )

      val frameArea = image.cols().toDouble() * image.rows().toDouble()
      val minimumArea = frameArea * DOCUMENT_QUAD_MIN_AREA_FRACTION
      return contours
        .sortedByDescending(Imgproc::contourArea)
        .firstNotNullOfOrNull { contour ->
          if (Imgproc.contourArea(contour) < minimumArea) return@firstNotNullOfOrNull null
          val contour2f = MatOfPoint2f(*contour.toArray())
          val approx = MatOfPoint2f()
          try {
            val perimeter = Imgproc.arcLength(contour2f, true)
            Imgproc.approxPolyDP(contour2f, approx, 0.02 * perimeter, true)
            val points = approx.toArray()
            if (points.size == 4) orderQuadCorners(points) else null
          } finally {
            contour2f.release()
            approx.release()
          }
        }
    } finally {
      contours.forEach(MatOfPoint::release)
      gray.release()
      blurred.release()
      edges.release()
      dilated.release()
      hierarchy.release()
    }
  }

  private fun orderQuadCorners(points: Array<Point>): Array<Point> {
    val byY = points.sortedBy { it.y }
    val top = byY.take(2).sortedBy { it.x }
    val bottom = byY.takeLast(2).sortedBy { it.x }
    return arrayOf(top[0], top[1], bottom[1], bottom[0])
  }

  private fun warpToQuad(image: Mat, quad: Array<Point>): Mat {
    val topLeft = quad[0]
    val topRight = quad[1]
    val bottomRight = quad[2]
    val bottomLeft = quad[3]
    val targetWidth = max(pointDistance(topLeft, topRight), pointDistance(bottomLeft, bottomRight))
      .roundToInt().coerceAtLeast(1)
    val targetHeight = max(pointDistance(topLeft, bottomLeft), pointDistance(topRight, bottomRight))
      .roundToInt().coerceAtLeast(1)

    val source = MatOfPoint2f(topLeft, topRight, bottomRight, bottomLeft)
    val destination = MatOfPoint2f(
      Point(0.0, 0.0),
      Point((targetWidth - 1).toDouble(), 0.0),
      Point((targetWidth - 1).toDouble(), (targetHeight - 1).toDouble()),
      Point(0.0, (targetHeight - 1).toDouble()),
    )
    val transform = Imgproc.getPerspectiveTransform(source, destination)
    val warped = Mat()
    try {
      Imgproc.warpPerspective(image, warped, transform, Size(targetWidth.toDouble(), targetHeight.toDouble()))
      return warped
    } finally {
      source.release()
      destination.release()
      transform.release()
    }
  }

  /**
   * Divides each color channel by its own heavily blurred copy - the same shadow-
   * removal technique used for written-response evidence and registration-marker
   * detection, applied per channel so the result stays a plausible color image
   * (not desaturated to gray) for the evidence/overlay images saved from it.
   */
  private fun removeShadowsPerChannel(image: Mat): Mat {
    val channels = ArrayList<Mat>()
    val corrected = ArrayList<Mat>()
    try {
      Core.split(image, channels)
      channels.forEach { channel ->
        val background = Mat()
        val normalized = Mat()
        try {
          Imgproc.GaussianBlur(channel, background, Size(0.0, 0.0), DOCUMENT_SHADOW_BLUR_SIGMA)
          Core.divide(channel, background, normalized, 255.0)
          corrected += normalized
        } finally {
          background.release()
        }
      }
      val merged = Mat()
      Core.merge(corrected, merged)
      return merged
    } finally {
      channels.forEach(Mat::release)
      corrected.forEach(Mat::release)
    }
  }

  /**
   * Tries progressively more lighting-robust binarizations of the same crop until one
   * yields all 4 registration-marker corners. Each pass is a strict fallback - the
   * first pass is byte-for-byte the original single-Otsu-threshold behavior, so a page
   * that already detects correctly today keeps taking the exact same path. Only pages
   * that pass 1 fails to read (typically an uneven light source or a phone-cast
   * shadow, per teacher reports) fall through to the more expensive passes.
   */
  private fun findAlignmentMarkers(image: Mat): List<Point>? {
    val gray = Mat()
    val blurred = Mat()
    try {
      Imgproc.cvtColor(image, gray, Imgproc.COLOR_BGR2GRAY)
      Imgproc.GaussianBlur(gray, blurred, Size(3.0, 3.0), 0.0)

      val otsu = Mat()
      try {
        Imgproc.threshold(blurred, otsu, 0.0, 255.0, Imgproc.THRESH_BINARY_INV or Imgproc.THRESH_OTSU)
        findMarkerCornersFromBinary(otsu, image.cols(), image.rows())?.let { return it }
      } finally {
        otsu.release()
      }

      val adaptive = Mat()
      try {
        Imgproc.adaptiveThreshold(
          blurred,
          adaptive,
          255.0,
          Imgproc.ADAPTIVE_THRESH_GAUSSIAN_C,
          Imgproc.THRESH_BINARY_INV,
          MARKER_ADAPTIVE_BLOCK_SIZE,
          MARKER_ADAPTIVE_C,
        )
        findMarkerCornersFromBinary(adaptive, image.cols(), image.rows())?.let { return it }
      } finally {
        adaptive.release()
      }

      val background = Mat()
      val shadowCorrected = Mat()
      val correctedOtsu = Mat()
      try {
        Imgproc.GaussianBlur(blurred, background, Size(0.0, 0.0), MARKER_SHADOW_BLUR_SIGMA)
        Core.divide(blurred, background, shadowCorrected, 255.0)
        Imgproc.threshold(
          shadowCorrected,
          correctedOtsu,
          0.0,
          255.0,
          Imgproc.THRESH_BINARY_INV or Imgproc.THRESH_OTSU,
        )
        return findMarkerCornersFromBinary(correctedOtsu, image.cols(), image.rows())
      } finally {
        background.release()
        shadowCorrected.release()
        correctedOtsu.release()
      }
    } finally {
      gray.release()
      blurred.release()
    }
  }

  private fun findMarkerCornersFromBinary(threshold: Mat, width: Int, height: Int): List<Point>? {
    val hierarchy = Mat()
    val contours = mutableListOf<MatOfPoint>()
    try {
      Imgproc.findContours(
        threshold,
        contours,
        hierarchy,
        Imgproc.RETR_EXTERNAL,
        Imgproc.CHAIN_APPROX_SIMPLE,
      )

      val widthD = width.toDouble()
      val heightD = height.toDouble()
      val minimumSide = max(12.0, minOf(widthD, heightD) * 0.012)
      val maximumSide = max(48.0, minOf(widthD, heightD) * 0.055)
      val minimumArea = widthD * heightD * 0.00015
      val candidates = contours.mapNotNull { contour ->
        val rectangle = Imgproc.boundingRect(contour)
        val contourWidth = rectangle.width.toDouble()
        val contourHeight = rectangle.height.toDouble()
        if (contourWidth !in minimumSide..maximumSide || contourHeight !in minimumSide..maximumSide) {
          return@mapNotNull null
        }
        val aspectRatio = contourWidth / contourHeight
        val area = Imgproc.contourArea(contour)
        val extent = area / (contourWidth * contourHeight)
        if (aspectRatio !in 0.70..1.30 || area < minimumArea || extent < 0.55) {
          return@mapNotNull null
        }
        Point(rectangle.x + contourWidth / 2.0, rectangle.y + contourHeight / 2.0)
      }

      val cornerRules = listOf<(Point) -> Boolean>(
        { it.x < widthD * 0.35 && it.y < heightD * 0.25 },
        { it.x > widthD * 0.65 && it.y < heightD * 0.25 },
        { it.x > widthD * 0.65 && it.y > heightD * 0.75 },
        { it.x < widthD * 0.35 && it.y > heightD * 0.75 },
      )
      val corners = listOf(
        Point(0.0, 0.0),
        Point(widthD, 0.0),
        Point(widthD, heightD),
        Point(0.0, heightD),
      )
      return cornerRules.mapIndexed { index, rule ->
        candidates.filter(rule).minByOrNull { point ->
          hypot(point.x - corners[index].x, point.y - corners[index].y)
        } ?: return null
      }
    } finally {
      contours.forEach(MatOfPoint::release)
      hierarchy.release()
    }
  }

  private fun alignFromMarkers(image: Mat, markerCenters: List<Point>, page: Page): Mat {
    val targetWidth = (page.widthPt * WARP_SCALE).roundToInt()
    val targetHeight = (page.heightPt * WARP_SCALE).roundToInt()
    val xScale = targetWidth / page.widthPt
    val yScale = targetHeight / page.heightPt
    val destinations = page.markers.map { marker ->
      Point(
        (marker.x + marker.width / 2.0) * xScale,
        (page.heightPt - marker.y - marker.height / 2.0) * yScale,
      )
    }
    val sourcePoints = MatOfPoint2f(*markerCenters.toTypedArray())
    val destinationPoints = MatOfPoint2f(*destinations.toTypedArray())
    val transform = Imgproc.getPerspectiveTransform(sourcePoints, destinationPoints)
    val aligned = Mat()
    try {
      Imgproc.warpPerspective(
        image,
        aligned,
        transform,
        Size(targetWidth.toDouble(), targetHeight.toDouble()),
      )
      return aligned
    } finally {
      sourcePoints.release()
      destinationPoints.release()
      transform.release()
    }
  }

  private fun validateMarkerPattern(aligned: Mat, page: Page): List<DynamicMarkerCheck> {
    val gray = Mat()
    try {
      Imgproc.cvtColor(aligned, gray, Imgproc.COLOR_BGR2GRAY)
      return page.markers.map { marker ->
        val center = pointToPixel(
          marker.x + marker.width / 2.0,
          marker.y + marker.height / 2.0,
          page.widthPt,
          page.heightPt,
          aligned,
        )
        val scale = minOf(aligned.cols() / page.widthPt, aligned.rows() / page.heightPt)
        val sampleRadius = max(2, (minOf(marker.width, marker.height) * scale * 0.12).roundToInt())
        val left = max(0, center.x.roundToInt() - sampleRadius)
        val top = max(0, center.y.roundToInt() - sampleRadius)
        val right = minOf(gray.cols(), center.x.roundToInt() + sampleRadius + 1)
        val bottom = minOf(gray.rows(), center.y.roundToInt() + sampleRadius + 1)
        require(left < right && top < bottom) { "Marker ${marker.corner} produced an empty sample." }
        val sample = gray.submat(Rect(left, top, right - left, bottom - top))
        val darkness = try {
          1.0 - Core.mean(sample).`val`[0] / 255.0
        } finally {
          sample.release()
        }
        if (marker.style == "hollow") {
          require(darkness <= 0.35) { "The top-left orientation marker is not hollow." }
        } else {
          require(darkness >= 0.55) { "Marker ${marker.corner} is not solid." }
        }
        DynamicMarkerCheck(marker.corner, marker.style, round4(darkness))
      }
    } finally {
      gray.release()
    }
  }

  private fun findPrintedBubbles(gray: Mat): List<PrintedCircle> {
    val median = Mat()
    val circles = Mat()
    try {
      Imgproc.medianBlur(gray, median, 5)
      Imgproc.HoughCircles(
        median,
        circles,
        Imgproc.HOUGH_GRADIENT,
        1.2,
        25.0,
        80.0,
        25.0,
        9,
        18,
      )
      if (circles.empty()) return emptyList()
      return (0 until circles.cols()).mapNotNull { index ->
        val values = circles.get(0, index) ?: return@mapNotNull null
        if (values.size < 3) return@mapNotNull null
        PrintedCircle(values[0], values[1], values[2])
      }
    } finally {
      median.release()
      circles.release()
    }
  }

  private fun snapToPrintedBubble(
    circles: List<PrintedCircle>,
    expectedX: Double,
    expectedY: Double,
    expectedRadius: Int,
  ): Pair<Point, Int> {
    val nearest = circles.minByOrNull { circle ->
      hypot(circle.x - expectedX, circle.y - expectedY)
    }
    if (nearest == null || hypot(nearest.x - expectedX, nearest.y - expectedY) > MAX_CENTER_SNAP_DISTANCE) {
      return Point(expectedX, expectedY) to expectedRadius
    }
    return Point(nearest.x, nearest.y) to nearest.radius.roundToInt()
  }

  private fun bubbleDarkness(gray: Mat, centerX: Int, centerY: Int, radius: Int): Double {
    val sampleRadius = (radius * 1.7).roundToInt()
    val startX = max(0, centerX - sampleRadius)
    val startY = max(0, centerY - sampleRadius)
    val endX = minOf(gray.cols(), centerX + sampleRadius + 1)
    val endY = minOf(gray.rows(), centerY + sampleRadius + 1)
    if (startX >= endX || startY >= endY) return 0.0

    val roi = gray.submat(Rect(startX, startY, endX - startX, endY - startY))
    try {
      val pixels = ByteArray((roi.total() * roi.channels()).toInt())
      roi.get(0, 0, pixels)
      val inner = mutableListOf<Int>()
      val background = mutableListOf<Int>()
      val localX = centerX - startX
      val localY = centerY - startY
      for (y in 0 until roi.rows()) {
        for (x in 0 until roi.cols()) {
          val distance = hypot((x - localX).toDouble(), (y - localY).toDouble())
          val value = pixels[y * roi.cols() + x].toInt() and 0xff
          if (distance >= radius * 0.38 && distance <= radius * 0.72) {
            inner += value
          } else if (distance >= radius * 1.25 && distance <= radius * 1.65) {
            background += value
          }
        }
      }
      if (inner.isEmpty() || background.isEmpty()) return 0.0
      val sortedBackground = background.sorted()
      val median = sortedBackground[sortedBackground.size / 2].toDouble()
      return inner.count { it < median - LOCAL_DARKNESS_DELTA }.toDouble() / inner.size
    } finally {
      roi.release()
    }
  }

  private fun classify(optionScores: Map<String, Double>): ClassifiedMark {
    val ranked = optionScores.entries.sortedByDescending { it.value }
    require(ranked.isNotEmpty()) { "Objective region has no options." }
    val top = ranked.first()
    val second = ranked.getOrElse(1) { top }
    val gap = round4(top.value - second.value)
    val marked = ranked.filter { it.value >= MARK_THRESHOLD }.map { it.key }
    if (marked.size > 1) {
      return ClassifiedMark(null, "multiple_marks", marked, round4(top.value), gap)
    }
    if (marked.size == 1) {
      return ClassifiedMark(marked.first(), "detected", marked, round4(top.value), gap)
    }
    val possible = ranked.filter { it.value >= POSSIBLE_MARK_THRESHOLD }.map { it.key }
    if (possible.isNotEmpty()) {
      return ClassifiedMark(null, "uncertain", possible, round4(top.value), gap)
    }
    return ClassifiedMark(null, "blank", emptyList(), round4(top.value), gap)
  }

  private fun enhanceWrittenResponse(crop: Mat): Mat {
    val gray = Mat()
    val background = Mat()
    val normalized = Mat()
    val contrast = Mat()
    val softened = Mat()
    val sharpened = Mat()
    val clahe = Imgproc.createCLAHE(2.0, Size(8.0, 8.0))
    try {
      Imgproc.cvtColor(crop, gray, Imgproc.COLOR_BGR2GRAY)
      Imgproc.GaussianBlur(gray, background, Size(0.0, 0.0), 15.0)
      Core.divide(gray, background, normalized, 255.0)
      clahe.apply(normalized, contrast)
      Imgproc.GaussianBlur(contrast, softened, Size(0.0, 0.0), 0.9)
      Core.addWeighted(contrast, 1.55, softened, -0.55, 0.0, sharpened)
      return sharpened
    } finally {
      clahe.collectGarbage()
      gray.release()
      background.release()
      normalized.release()
      contrast.release()
      softened.release()
    }
  }

  private fun cropRegion(aligned: Mat, region: Region, page: Page): Mat {
    val topLeft = pointToPixel(
      region.x,
      region.y + region.height,
      page.widthPt,
      page.heightPt,
      aligned,
    )
    val bottomRight = pointToPixel(
      region.x + region.width,
      region.y,
      page.widthPt,
      page.heightPt,
      aligned,
    )
    val left = max(0, minOf(topLeft.x, bottomRight.x).roundToInt())
    val top = max(0, minOf(topLeft.y, bottomRight.y).roundToInt())
    val right = minOf(aligned.cols(), max(topLeft.x, bottomRight.x).roundToInt())
    val bottom = minOf(aligned.rows(), max(topLeft.y, bottomRight.y).roundToInt())
    require(left < right && top < bottom) { "Manifest region produced an empty evidence crop." }
    return aligned.submat(Rect(left, top, right - left, bottom - top)).clone()
  }

  private fun pointToPixel(
    x: Double,
    y: Double,
    pageWidth: Double,
    pageHeight: Double,
    image: Mat,
  ): Point = Point(
    x * image.cols() / pageWidth,
    (pageHeight - y) * image.rows() / pageHeight,
  )

  private fun decodeCompactUuid(value: String): String {
    val bytes = Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    require(bytes.size == 16) { "QR contains an invalid compact UUID." }
    val buffer = ByteBuffer.wrap(bytes)
    return UUID(buffer.long, buffer.long).toString()
  }

  private fun encodeGeometryHash(hex: String): String {
    require(hex.length == 64 && hex.all { it in "0123456789abcdef" }) {
      "Manifest contains an invalid page geometry hash."
    }
    val bytes = ByteArray(32) { index ->
      hex.substring(index * 2, index * 2 + 2).toInt(16).toByte()
    }
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(8192)
      while (true) {
        val count = input.read(buffer)
        if (count <= 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun closeEnough(left: Double, right: Double): Boolean = kotlin.math.abs(left - right) < 0.01

  private fun round1(value: Double): Double = (value * 10.0).roundToInt() / 10.0

  private fun round4(value: Double): Double = (value * 10_000.0).roundToInt() / 10_000.0
}
