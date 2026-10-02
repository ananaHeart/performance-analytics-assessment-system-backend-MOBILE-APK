package com.mobileassessmentapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import org.opencv.android.OpenCVLoader
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
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
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

data class OmrSheetIdentity(
  val payloadVersion: String,
  val templateVersion: String,
  val questionType: String,
  val itemCount: Int,
  val testId: Long?,
)

data class OmrDetection(
  val itemNumber: Int,
  val detectedOption: String?,
  val confidenceScore: Double,
  val detectionStatus: String,
  val markedOptions: List<String>,
  val optionScores: Map<String, Double>,
  val scoreGap: Double,
  val detectedAt: String,
)

data class OmrScanResult(
  val scannerVersion: String,
  val templateVersion: String,
  val questionType: String,
  val itemCount: Int,
  val sourceImageUri: String,
  val alignedImageUri: String,
  val annotatedImageUri: String,
  val imageHash: String,
  val alignmentMethod: String,
  val sheetIdentity: OmrSheetIdentity,
  val detections: List<OmrDetection>,
)

object OmrDetector {
  const val TEMPLATE_VERSION = "OMR-A4-10-MC-CTX-V2"
  const val SCANNER_VERSION = "3.0.0"
  const val ITEM_COUNT = 10

  private const val TEMPLATE_ASSET = "omr/omr_mc_10_context_v2.json"
  private const val QUESTION_TYPE = "multiple_choice"
  private const val WARP_SCALE = 2.0
  private const val MARK_THRESHOLD = 0.75
  private const val POSSIBLE_MARK_THRESHOLD = 0.30
  private const val LOCAL_DARKNESS_DELTA = 22.0
  private const val MAX_INPUT_DIMENSION = 2200.0

  private data class Bubble(
    val option: String,
    val centerXPt: Double,
    val centerYPt: Double,
    val radiusPt: Double,
  )

  private data class TemplateItem(
    val itemNumber: Int,
    val bubbles: List<Bubble>,
  )

  private data class Template(
    val version: String,
    val pageWidthPt: Double,
    val pageHeightPt: Double,
    val itemCount: Int,
    val questionType: String,
    val items: List<TemplateItem>,
  )

  private data class ClassifiedMark(
    val detectedOption: String?,
    val status: String,
    val markedOptions: List<String>,
    val confidence: Double,
    val scoreGap: Double,
  )

  fun detect(
    context: Context,
    imageFile: File,
    expectedTemplateVersion: String,
    expectedItemCount: Int,
    expectedTestId: Long?,
  ): OmrScanResult {
    check(OpenCVLoader.initLocal()) { "OpenCV could not be initialized on this device." }

    val template = loadTemplate(context)
    require(template.version == expectedTemplateVersion) {
      "Unsupported template. Expected $expectedTemplateVersion but the scanner contains ${template.version}."
    }
    require(template.itemCount == expectedItemCount) {
      "Unsupported item count. This scanner supports ${template.itemCount} items."
    }
    require(template.questionType == QUESTION_TYPE) {
      "Only the fixed Multiple Choice template is supported in this phone prototype."
    }

    val decoded = Imgcodecs.imread(imageFile.absolutePath, Imgcodecs.IMREAD_COLOR)
    require(!decoded.empty()) { "The captured image could not be decoded." }
    val source = downscaleIfNeeded(decoded)
    if (source !== decoded) {
      decoded.release()
    }

    var aligned: Mat? = null
    var identity: OmrSheetIdentity? = null
    var selectedOrientation = ""
    val errors = mutableListOf<String>()

    try {
      orientationCandidates(source).forEach { (orientation, oriented) ->
        if (aligned != null) {
          oriented.release()
          return@forEach
        }

        val markers = findAlignmentMarkers(oriented)
        if (markers == null) {
          errors += "$orientation: four corner markers were not found"
          oriented.release()
          return@forEach
        }

        val candidate = alignFromMarkers(oriented, markers, template)
        oriented.release()
        val decodedIdentity = decodeSheetIdentity(candidate)
        if (decodedIdentity == null) {
          errors += "$orientation: QR code could not be decoded"
          candidate.release()
          return@forEach
        }

        val mismatch = validateIdentity(
          identity = decodedIdentity,
          template = template,
          expectedTemplateVersion = expectedTemplateVersion,
          expectedItemCount = expectedItemCount,
          expectedTestId = expectedTestId,
        )
        if (mismatch != null) {
          errors += "$orientation: $mismatch"
          candidate.release()
          return@forEach
        }

        aligned = candidate
        identity = decodedIdentity
        selectedOrientation = orientation
      }

      val finalAligned = aligned ?: throw IllegalArgumentException(
        "Sheet validation failed. Keep all four square markers and the QR visible. " +
          errors.distinct().joinToString("; "),
      )
      val finalIdentity = requireNotNull(identity)
      val detections = detectBubbles(finalAligned, template)
      val outputRoot = requireNotNull(imageFile.parentFile)
      val stem = imageFile.nameWithoutExtension
      val alignedFile = File(outputRoot, "${stem}_aligned.jpg")
      val annotatedFile = File(outputRoot, "${stem}_detected.jpg")
      Imgcodecs.imwrite(alignedFile.absolutePath, finalAligned)
      writeAnnotatedImage(finalAligned, template, detections, annotatedFile)

      return OmrScanResult(
        scannerVersion = SCANNER_VERSION,
        templateVersion = template.version,
        questionType = template.questionType,
        itemCount = template.itemCount,
        sourceImageUri = Uri.fromFile(imageFile).toString(),
        alignedImageUri = Uri.fromFile(alignedFile).toString(),
        annotatedImageUri = Uri.fromFile(annotatedFile).toString(),
        imageHash = sha256(imageFile),
        alignmentMethod = "four_corner_markers:$selectedOrientation",
        sheetIdentity = finalIdentity,
        detections = detections,
      )
    } finally {
      aligned?.release()
      source.release()
    }
  }

  private fun loadTemplate(context: Context): Template {
    val raw = context.assets.open(TEMPLATE_ASSET).bufferedReader().use { it.readText() }
    val json = JSONObject(raw)
    val itemsJson = json.getJSONArray("items")
    val items = (0 until itemsJson.length()).map { itemIndex ->
      val itemJson = itemsJson.getJSONObject(itemIndex)
      val optionsJson = itemJson.getJSONArray("options")
      TemplateItem(
        itemNumber = itemJson.getInt("item_number"),
        bubbles = (0 until optionsJson.length()).map { optionIndex ->
          val optionJson = optionsJson.getJSONObject(optionIndex)
          Bubble(
            option = optionJson.getString("option"),
            centerXPt = optionJson.getDouble("center_x_pt"),
            centerYPt = optionJson.getDouble("center_y_pt"),
            radiusPt = optionJson.getDouble("radius_pt"),
          )
        },
      )
    }

    return Template(
      version = json.getString("template_version"),
      pageWidthPt = json.getDouble("page_width_pt"),
      pageHeightPt = json.getDouble("page_height_pt"),
      itemCount = json.getInt("item_count"),
      questionType = json.getString("question_type"),
      items = items,
    )
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

  private fun orientationCandidates(source: Mat): List<Pair<String, Mat>> {
    val upright = source.clone()
    val clockwise = Mat()
    val counterClockwise = Mat()
    val upsideDown = Mat()
    Core.rotate(source, clockwise, Core.ROTATE_90_CLOCKWISE)
    Core.rotate(source, counterClockwise, Core.ROTATE_90_COUNTERCLOCKWISE)
    Core.rotate(source, upsideDown, Core.ROTATE_180)
    return listOf(
      "original" to upright,
      "clockwise" to clockwise,
      "counter_clockwise" to counterClockwise,
      "upside_down" to upsideDown,
    )
  }

  private fun findAlignmentMarkers(image: Mat): List<Point>? {
    val gray = Mat()
    val blurred = Mat()
    val threshold = Mat()
    val hierarchy = Mat()
    val contours = mutableListOf<MatOfPoint>()

    try {
      Imgproc.cvtColor(image, gray, Imgproc.COLOR_BGR2GRAY)
      Imgproc.GaussianBlur(gray, blurred, Size(3.0, 3.0), 0.0)
      Imgproc.threshold(
        blurred,
        threshold,
        0.0,
        255.0,
        Imgproc.THRESH_BINARY_INV or Imgproc.THRESH_OTSU,
      )
      Imgproc.findContours(
        threshold,
        contours,
        hierarchy,
        Imgproc.RETR_EXTERNAL,
        Imgproc.CHAIN_APPROX_SIMPLE,
      )

      val width = image.cols().toDouble()
      val height = image.rows().toDouble()
      val minimumSide = max(12.0, minOf(width, height) * 0.012)
      val maximumSide = max(48.0, minOf(width, height) * 0.055)
      val minimumArea = width * height * 0.00015
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
        { it.x < width * 0.35 && it.y < height * 0.25 },
        { it.x > width * 0.65 && it.y < height * 0.25 },
        { it.x > width * 0.65 && it.y > height * 0.75 },
        { it.x < width * 0.35 && it.y > height * 0.75 },
      )
      val cornerPoints = listOf(
        Point(0.0, 0.0),
        Point(width, 0.0),
        Point(width, height),
        Point(0.0, height),
      )

      val selected = cornerRules.mapIndexed { index, rule ->
        candidates.filter(rule).minByOrNull { candidate ->
          hypot(candidate.x - cornerPoints[index].x, candidate.y - cornerPoints[index].y)
        } ?: return null
      }
      return selected
    } finally {
      contours.forEach(MatOfPoint::release)
      gray.release()
      blurred.release()
      threshold.release()
      hierarchy.release()
    }
  }

  private fun alignFromMarkers(image: Mat, markers: List<Point>, template: Template): Mat {
    val targetWidth = (template.pageWidthPt * WARP_SCALE).roundToInt()
    val targetHeight = (template.pageHeightPt * WARP_SCALE).roundToInt()
    val markerCenterPt = 27.5
    val xScale = targetWidth / template.pageWidthPt
    val yScale = targetHeight / template.pageHeightPt
    val destinations = listOf(
      Point(markerCenterPt * xScale, markerCenterPt * yScale),
      Point((template.pageWidthPt - markerCenterPt) * xScale, markerCenterPt * yScale),
      Point(
        (template.pageWidthPt - markerCenterPt) * xScale,
        (template.pageHeightPt - markerCenterPt) * yScale,
      ),
      Point(markerCenterPt * xScale, (template.pageHeightPt - markerCenterPt) * yScale),
    )
    val sourcePoints = MatOfPoint2f(*markers.toTypedArray())
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

  private fun decodeSheetIdentity(aligned: Mat): OmrSheetIdentity? {
    val detector = QRCodeDetector()
    decodeQr(detector, aligned)?.let(::parseIdentity)?.let { return it }

    val crop = aligned.submat(
      Rect(
        (aligned.cols() * 0.55).roundToInt(),
        0,
        aligned.cols() - (aligned.cols() * 0.55).roundToInt(),
        (aligned.rows() * 0.38).roundToInt(),
      ),
    )
    try {
      decodeQr(detector, crop)?.let(::parseIdentity)?.let { return it }

      val enlarged = Mat()
      val gray = Mat()
      val enlargedGray = Mat()
      val threshold = Mat()
      try {
        Imgproc.resize(crop, enlarged, Size(), 2.5, 2.5, Imgproc.INTER_CUBIC)
        decodeQr(detector, enlarged)?.let(::parseIdentity)?.let { return it }

        Imgproc.cvtColor(crop, gray, Imgproc.COLOR_BGR2GRAY)
        Imgproc.resize(gray, enlargedGray, Size(), 3.0, 3.0, Imgproc.INTER_CUBIC)
        decodeQr(detector, enlargedGray)?.let(::parseIdentity)?.let { return it }

        Imgproc.threshold(
          enlargedGray,
          threshold,
          0.0,
          255.0,
          Imgproc.THRESH_BINARY or Imgproc.THRESH_OTSU,
        )
        decodeQr(detector, threshold)?.let(::parseIdentity)?.let { return it }
      } finally {
        enlarged.release()
        gray.release()
        enlargedGray.release()
        threshold.release()
      }
    } finally {
      crop.release()
    }
    return null
  }

  private fun decodeQr(detector: QRCodeDetector, image: Mat): String? =
    runCatching { detector.detectAndDecode(image).trim().ifBlank { null } }.getOrNull()

  private fun parseIdentity(raw: String): OmrSheetIdentity? = runCatching {
    val json = JSONObject(raw)
    if (json.has("tv")) {
      val compactQuestionType = json.optString("qt", json.optString("q"))
      OmrSheetIdentity(
        payloadVersion = "omr-template-v${json.optInt("v", 2)}",
        templateVersion = json.getString("tv"),
        questionType = when (compactQuestionType) {
          "MC" -> "multiple_choice"
          "TF" -> "true_false"
          else -> compactQuestionType
        },
        itemCount = json.getInt("n"),
        testId = if (json.has("t") && !json.isNull("t")) json.getLong("t") else null,
      )
    } else {
      OmrSheetIdentity(
        payloadVersion = json.optString("payloadVersion", "omr-template-v2"),
        templateVersion = json.getString("templateVersion"),
        questionType = json.getString("questionType"),
        itemCount = json.getInt("itemCount"),
        testId = if (json.has("testId") && !json.isNull("testId")) json.getLong("testId") else null,
      )
    }
  }.getOrNull()

  private fun validateIdentity(
    identity: OmrSheetIdentity,
    template: Template,
    expectedTemplateVersion: String,
    expectedItemCount: Int,
    expectedTestId: Long?,
  ): String? {
    if (identity.templateVersion != expectedTemplateVersion || identity.templateVersion != template.version) {
      return "QR template does not match $expectedTemplateVersion"
    }
    if (identity.questionType != template.questionType) {
      return "QR question type does not match ${template.questionType}"
    }
    if (identity.itemCount != expectedItemCount || identity.itemCount != template.itemCount) {
      return "QR item count does not match $expectedItemCount"
    }
    if (expectedTestId != null && identity.testId != null && identity.testId != expectedTestId) {
      return "QR test ID ${identity.testId} does not match selected test $expectedTestId"
    }
    return null
  }

  private fun detectBubbles(aligned: Mat, template: Template): List<OmrDetection> {
    val gray = Mat()
    val blurred = Mat()
    try {
      Imgproc.cvtColor(aligned, gray, Imgproc.COLOR_BGR2GRAY)
      Imgproc.GaussianBlur(gray, blurred, Size(3.0, 3.0), 0.0)
      val xScale = aligned.cols() / template.pageWidthPt
      val yScale = aligned.rows() / template.pageHeightPt

      return template.items.map { item ->
        val optionScores = linkedMapOf<String, Double>()
        item.bubbles.forEach { bubble ->
          val centerX = (bubble.centerXPt * xScale).roundToInt()
          val centerY = ((template.pageHeightPt - bubble.centerYPt) * yScale).roundToInt()
          val radius = max(4, (bubble.radiusPt * xScale).roundToInt())
          optionScores[bubble.option] = round4(
            bubbleDarkness(blurred, centerX, centerY, radius),
          )
        }
        val mark = classify(optionScores)
        OmrDetection(
          itemNumber = item.itemNumber,
          detectedOption = mark.detectedOption,
          confidenceScore = mark.confidence,
          detectionStatus = mark.status,
          markedOptions = mark.markedOptions,
          optionScores = optionScores,
          scoreGap = mark.scoreGap,
          detectedAt = OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
        )
      }
    } finally {
      gray.release()
      blurred.release()
    }
  }

  private fun bubbleDarkness(gray: Mat, centerX: Int, centerY: Int, radius: Int): Double {
    val sampleRadius = (radius * 1.7).roundToInt()
    val startX = max(0, centerX - sampleRadius)
    val startY = max(0, centerY - sampleRadius)
    val endX = minOf(gray.cols(), centerX + sampleRadius + 1)
    val endY = minOf(gray.rows(), centerY + sampleRadius + 1)
    if (startX >= endX || startY >= endY) {
      return 0.0
    }

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
      if (inner.isEmpty() || background.isEmpty()) {
        return 0.0
      }

      val sortedBackground = background.sorted()
      val median = sortedBackground[sortedBackground.size / 2].toDouble()
      return inner.count { it < median - LOCAL_DARKNESS_DELTA }.toDouble() / inner.size
    } finally {
      roi.release()
    }
  }

  private fun classify(optionScores: Map<String, Double>): ClassifiedMark {
    val ranked = optionScores.entries.sortedByDescending { it.value }
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

  private fun writeAnnotatedImage(
    aligned: Mat,
    template: Template,
    detections: List<OmrDetection>,
    output: File,
  ) {
    val annotated = aligned.clone()
    try {
      val xScale = annotated.cols() / template.pageWidthPt
      val yScale = annotated.rows() / template.pageHeightPt
      val detectionByItem = detections.associateBy { it.itemNumber }
      template.items.forEach { item ->
        val detection = detectionByItem[item.itemNumber] ?: return@forEach
        val color = when (detection.detectionStatus) {
          "detected" -> Scalar(40.0, 190.0, 60.0)
          "multiple_marks" -> Scalar(45.0, 45.0, 230.0)
          "uncertain" -> Scalar(0.0, 165.0, 255.0)
          else -> Scalar(140.0, 140.0, 140.0)
        }
        item.bubbles.forEach { bubble ->
          val center = Point(
            bubble.centerXPt * xScale,
            (template.pageHeightPt - bubble.centerYPt) * yScale,
          )
          val radius = max(4, (bubble.radiusPt * xScale).roundToInt())
          val highlighted = detection.markedOptions.contains(bubble.option)
          Imgproc.circle(
            annotated,
            center,
            radius + 4,
            if (highlighted) color else Scalar(175.0, 175.0, 175.0),
            if (highlighted) 3 else 1,
          )
        }
      }
      Imgcodecs.imwrite(output.absolutePath, annotated)
    } finally {
      annotated.release()
    }
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

  private fun round4(value: Double): Double = (value * 10_000.0).roundToInt() / 10_000.0
}
