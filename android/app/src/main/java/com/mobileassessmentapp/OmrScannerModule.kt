package com.mobileassessmentapp

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class OmrScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val MODULE_NAME = "OmrScanner"
    private const val CAPTURE_REQUEST_CODE = 4810
    private const val PICK_REQUEST_CODE = 4811
  }

  private data class PendingScan(
    val promise: Promise,
    val imageFile: File,
    val dynamicMode: Boolean,
    val expectedTemplateVersion: String,
    val expectedItemCount: Int,
    val expectedTestId: Long?,
    val expectedAnswerSheetUuid: String?,
    val expectedAssignmentUuid: String?,
    val manifestJson: String?,
  )

  private val executor = Executors.newSingleThreadExecutor()
  private var pendingScan: PendingScan? = null

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
    ) {
      if (requestCode != CAPTURE_REQUEST_CODE && requestCode != PICK_REQUEST_CODE) {
        return
      }

      val pending = pendingScan ?: return
      if (resultCode != Activity.RESULT_OK) {
        pendingScan = null
        pending.imageFile.delete()
        pending.promise.reject("OMR_SCAN_CANCELLED", "The scan was cancelled.")
        return
      }

      if (requestCode == PICK_REQUEST_CODE) {
        val sourceUri = data?.data
        if (sourceUri == null) {
          pendingScan = null
          pending.promise.reject("OMR_IMAGE_MISSING", "No image was selected.")
          return
        }

        try {
          copyUriToFile(sourceUri, pending.imageFile)
        } catch (error: Exception) {
          pendingScan = null
          pending.promise.reject("OMR_IMAGE_READ_FAILED", error.message, error)
          return
        }
      }

      processPendingScan(pending)
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = MODULE_NAME

  /**
   * The attachment upload contract needs the exact byte size of a local evidence
   * file before upload. React Native's XMLHttpRequest `responseType: 'blob'` trick
   * for reading a local file:// URI depends on the same native Blob machinery that
   * turned out to be broken for FormData uploads under this app's New Architecture
   * setup (see objectiveClient.ts/writtenEvidenceClient.ts) - it fails the same way
   * here with a generic XHR onerror. Stat the file directly instead; no Blob/
   * networking involved at all.
   */
  @ReactMethod
  fun getFileSize(uri: String, promise: Promise) {
    try {
      val path = Uri.parse(uri).path
        ?: throw IllegalArgumentException("The file URI has no path: $uri")
      val file = File(path)
      if (!file.isFile) {
        promise.reject("OMR_FILE_NOT_FOUND", "No file exists at $uri.")
        return
      }
      promise.resolve(file.length().toDouble())
    } catch (error: Exception) {
      promise.reject("OMR_FILE_STAT_FAILED", "Could not read the size of $uri.", error)
    }
  }

  @ReactMethod
  fun captureAndDetect(options: ReadableMap, promise: Promise) {
    if (!beginScan(options, promise, CAPTURE_REQUEST_CODE, dynamicMode = false)) {
      return
    }

    val activity = reactContext.currentActivity
    val pending = pendingScan ?: return
    if (activity == null) {
      pendingScan = null
      promise.reject("OMR_ACTIVITY_UNAVAILABLE", "The Android activity is not available.")
      return
    }

    val imageUri = FileProvider.getUriForFile(
      reactContext,
      "${reactContext.packageName}.fileprovider",
      pending.imageFile,
    )
    val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
      putExtra(MediaStore.EXTRA_OUTPUT, imageUri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      clipData = ClipData.newRawUri("OMR answer sheet", imageUri)
    }

    if (intent.resolveActivity(reactContext.packageManager) == null) {
      pendingScan = null
      pending.imageFile.delete()
      promise.reject("OMR_CAMERA_UNAVAILABLE", "No camera application is available on this device.")
      return
    }

    activity.startActivityForResult(intent, CAPTURE_REQUEST_CODE)
  }

  @ReactMethod
  fun chooseAndDetect(options: ReadableMap, promise: Promise) {
    if (!beginScan(options, promise, PICK_REQUEST_CODE, dynamicMode = false)) {
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      pendingScan = null
      promise.reject("OMR_ACTIVITY_UNAVAILABLE", "The Android activity is not available.")
      return
    }

    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "image/*"
    }
    activity.startActivityForResult(intent, PICK_REQUEST_CODE)
  }

  @ReactMethod
  fun captureDynamicAndDetect(options: ReadableMap, promise: Promise) {
    if (!beginScan(options, promise, CAPTURE_REQUEST_CODE, dynamicMode = true)) {
      return
    }

    val activity = reactContext.currentActivity
    val pending = pendingScan ?: return
    if (activity == null) {
      pendingScan = null
      promise.reject("OMR_ACTIVITY_UNAVAILABLE", "The Android activity is not available.")
      return
    }

    val imageUri = FileProvider.getUriForFile(
      reactContext,
      "${reactContext.packageName}.fileprovider",
      pending.imageFile,
    )
    val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
      putExtra(MediaStore.EXTRA_OUTPUT, imageUri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      clipData = ClipData.newRawUri("Dynamic answer sheet", imageUri)
    }
    if (intent.resolveActivity(reactContext.packageManager) == null) {
      pendingScan = null
      pending.imageFile.delete()
      promise.reject("OMR_CAMERA_UNAVAILABLE", "No camera application is available on this device.")
      return
    }
    activity.startActivityForResult(intent, CAPTURE_REQUEST_CODE)
  }

  @ReactMethod
  fun chooseDynamicAndDetect(options: ReadableMap, promise: Promise) {
    if (!beginScan(options, promise, PICK_REQUEST_CODE, dynamicMode = true)) {
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      pendingScan = null
      promise.reject("OMR_ACTIVITY_UNAVAILABLE", "The Android activity is not available.")
      return
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "image/*"
    }
    activity.startActivityForResult(intent, PICK_REQUEST_CODE)
  }

  private fun beginScan(
    options: ReadableMap,
    promise: Promise,
    requestCode: Int,
    dynamicMode: Boolean,
  ): Boolean {
    if (pendingScan != null) {
      promise.reject("OMR_SCAN_IN_PROGRESS", "Another answer sheet is already being processed.")
      return false
    }

    val expectedTemplateVersion = options.stringOrNull("expectedTemplateVersion")
      ?: OmrDetector.TEMPLATE_VERSION
    val expectedItemCount = options.intOrNull("expectedItemCount")
      ?: OmrDetector.ITEM_COUNT
    val expectedTestId = options.longOrNull("expectedTestId")
    val expectedAnswerSheetUuid = options.stringOrNull("expectedAnswerSheetUuid")
    val expectedAssignmentUuid = options.stringOrNull("expectedAssignmentUuid")
    // When supplied, this is a manifest fetched from the backend for a specific
    // assignment/answer-sheet (see mobileReadClient.ts), and it is used instead of the
    // 3 bundled asset files that manifestAssets otherwise looks up by template code.
    val manifestJson = options.stringOrNull("manifestJson")
    val source = if (requestCode == CAPTURE_REQUEST_CODE) "camera" else "gallery"
    val imageFile = createImageFile(if (dynamicMode) "dynamic_$source" else source)

    pendingScan = PendingScan(
      promise = promise,
      imageFile = imageFile,
      dynamicMode = dynamicMode,
      expectedTemplateVersion = expectedTemplateVersion,
      expectedItemCount = expectedItemCount,
      expectedTestId = expectedTestId,
      expectedAnswerSheetUuid = expectedAnswerSheetUuid,
      expectedAssignmentUuid = expectedAssignmentUuid,
      manifestJson = manifestJson,
    )
    return true
  }

  private fun processPendingScan(pending: PendingScan) {
    executor.execute {
      try {
        if (!pending.imageFile.exists() || pending.imageFile.length() == 0L) {
          throw IllegalStateException("The camera did not create a readable image.")
        }
        awaitCompleteJpeg(pending.imageFile)

        val result = if (pending.dynamicMode) {
          DynamicOmrDetector.detect(
            context = reactContext,
            imageFile = pending.imageFile,
            expectedAnswerSheetUuid = pending.expectedAnswerSheetUuid,
            expectedAssignmentUuid = pending.expectedAssignmentUuid,
            overrideManifestJson = pending.manifestJson,
          ).toWritableMap()
        } else {
          OmrDetector.detect(
            context = reactContext,
            imageFile = pending.imageFile,
            expectedTemplateVersion = pending.expectedTemplateVersion,
            expectedItemCount = pending.expectedItemCount,
            expectedTestId = pending.expectedTestId,
          ).toWritableMap()
        }
        reactContext.runOnUiQueueThread {
          pendingScan = null
          pending.promise.resolve(result)
        }
      } catch (error: Exception) {
        reactContext.runOnUiQueueThread {
          pendingScan = null
          pending.promise.reject("OMR_DETECTION_FAILED", error.message, error)
        }
      }
    }
  }

  private fun createImageFile(source: String): File {
    val root = File(
      reactContext.getExternalFilesDir(Environment.DIRECTORY_PICTURES),
      "omr_scans",
    )
    if (!root.exists() && !root.mkdirs()) {
      throw IllegalStateException("Unable to create the OMR scan directory.")
    }
    return File(root, "omr_${source}_${System.currentTimeMillis()}.jpg")
  }

  private fun copyUriToFile(sourceUri: Uri, destination: File) {
    reactContext.contentResolver.openInputStream(sourceUri).use { input ->
      requireNotNull(input) { "The selected image could not be opened." }
      FileOutputStream(destination).use { output -> input.copyTo(output) }
    }
  }

  /**
   * Some OEM camera apps return RESULT_OK for ACTION_IMAGE_CAPTURE slightly
   * before the JPEG they wrote to EXTRA_OUTPUT is fully flushed to disk,
   * leaving the file truncated at the exact moment this module reads it. That
   * truncated file then hashes and uploads "successfully" from the app's
   * point of view, and only fails much later at the backend's
   * evidence-integrity check. Poll briefly for a complete JPEG before
   * proceeding so a slow OEM flush doesn't get treated as a valid capture.
   *
   * Confirmed against a real capture on a Honor device: the camera app
   * appends a large vendor trailer AFTER the real end-of-image marker (here,
   * ~56KB of HDR-related data ending in a "HiHonor_EhdrEn" tag) - a small
   * trailing window is nowhere near enough to find the real 0xFFD9. This
   * scans the whole file for the last occurrence of the marker instead of
   * assuming any fixed trailer size.
   */
  private fun awaitCompleteJpeg(file: File) {
    val maxAttempts = 20
    val delayMs = 100L
    repeat(maxAttempts) { attempt ->
      if (containsJpegEoi(file)) return
      if (attempt < maxAttempts - 1) Thread.sleep(delayMs)
    }
    throw IllegalStateException(
      "The camera app did not finish saving the photo. Please retry the scan.",
    )
  }

  private fun containsJpegEoi(file: File): Boolean {
    val bytes = file.readBytes()
    for (i in bytes.size - 2 downTo 0) {
      if (bytes[i] == 0xFF.toByte() && bytes[i + 1] == 0xD9.toByte()) return true
    }
    return false
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    executor.shutdownNow()
    pendingScan = null
    super.invalidate()
  }
}

private fun ReadableMap.stringOrNull(key: String): String? =
  if (hasKey(key) && !isNull(key)) getString(key) else null

private fun ReadableMap.intOrNull(key: String): Int? =
  if (hasKey(key) && !isNull(key)) getDouble(key).toInt() else null

private fun ReadableMap.longOrNull(key: String): Long? =
  if (hasKey(key) && !isNull(key)) getDouble(key).toLong() else null

private fun OmrScanResult.toWritableMap(): WritableMap = Arguments.createMap().apply {
  putString("scannerVersion", scannerVersion)
  putString("templateVersion", templateVersion)
  putString("questionType", questionType)
  putInt("itemCount", itemCount)
  putString("sourceImageUri", sourceImageUri)
  putString("alignedImageUri", alignedImageUri)
  putString("annotatedImageUri", annotatedImageUri)
  putString("imageHash", imageHash)
  putString("alignmentMethod", alignmentMethod)
  putBoolean("teacherVerificationRequired", true)
  putMap("sheetIdentity", Arguments.createMap().apply {
    putString("payloadVersion", sheetIdentity.payloadVersion)
    putString("templateVersion", sheetIdentity.templateVersion)
    putString("questionType", sheetIdentity.questionType)
    putInt("itemCount", sheetIdentity.itemCount)
    sheetIdentity.testId?.let { putDouble("testId", it.toDouble()) }
  })
  putArray("detections", Arguments.createArray().apply {
    detections.forEach { detection ->
      pushMap(Arguments.createMap().apply {
        putInt("itemNumber", detection.itemNumber)
        if (detection.detectedOption == null) {
          putNull("detectedOption")
        } else {
          putString("detectedOption", detection.detectedOption)
        }
        putDouble("confidenceScore", detection.confidenceScore)
        putString("detectionStatus", detection.detectionStatus)
        putString("verificationStatus", "pending")
        putString("detectedAt", detection.detectedAt)
        putMap("rawMarkInformation", Arguments.createMap().apply {
          putArray("markedOptions", Arguments.createArray().apply {
            detection.markedOptions.forEach(::pushString)
          })
          putMap("optionScores", Arguments.createMap().apply {
            detection.optionScores.forEach { (option, score) -> putDouble(option, score) }
          })
          putDouble("scoreGap", detection.scoreGap)
        })
      })
    }
  })
}

private fun DynamicOmrScanResult.toWritableMap(): WritableMap = Arguments.createMap().apply {
  putString("scannerVersion", scannerVersion)
  putString("manifestHash", manifestHash)
  putString("paperSize", paperSize)
  putString("sourceImageUri", sourceImageUri)
  putString("alignedImageUri", alignedImageUri)
  putString("annotatedImageUri", annotatedImageUri)
  putString("originalPageSha256", originalPageSha256)
  putString("uploadImageUri", uploadImageUri)
  putString("uploadImageSha256", uploadImageSha256)
  putInt("uploadImageWidthPx", uploadImageWidthPx)
  putInt("uploadImageHeightPx", uploadImageHeightPx)
  putString("alignmentMethod", alignmentMethod)
  putInt("inputRotationDegreesClockwise", inputRotationDegreesClockwise)
  putBoolean("teacherVerificationRequired", true)
  putBoolean("finalStudentAnswersGenerated", false)
  putMap("quality", Arguments.createMap().apply {
    putDouble("focusScore", quality.focusScore)
    putDouble("meanBrightness", quality.meanBrightness)
    putDouble("shadowPercent", quality.shadowPercent)
    putDouble("highlightPercent", quality.highlightPercent)
    putDouble("illuminationRange", quality.illuminationRange)
    putDouble("pageCoveragePercent", quality.pageCoveragePercent)
    putDouble("perspectiveSkewPercent", quality.perspectiveSkewPercent)
    putArray("warnings", Arguments.createArray().apply {
      quality.warnings.forEach(::pushString)
    })
  })
  putMap("timings", Arguments.createMap().apply {
    putDouble("qrDecodeMs", timings.qrDecodeMs.toDouble())
    putDouble("alignmentMs", timings.alignmentMs.toDouble())
    putDouble("analysisMs", timings.analysisMs.toDouble())
    putDouble("totalMs", timings.totalMs.toDouble())
  })
  putMap("identity", Arguments.createMap().apply {
    putInt("payloadVersion", identity.payloadVersion)
    putString("answerSheetUuid", identity.answerSheetUuid)
    putString("pageUuid", identity.pageUuid)
    putString("assignmentUuid", identity.assignmentUuid)
    putInt("pageNumber", identity.pageNumber)
    putInt("totalPages", identity.totalPages)
    putString("templateCode", identity.templateCode)
    putString("templateVersion", identity.templateVersion)
    putString("geometryHash", identity.geometryHash)
  })
  putArray("markerChecks", Arguments.createArray().apply {
    markerChecks.forEach { marker ->
      pushMap(Arguments.createMap().apply {
        putString("corner", marker.corner)
        putString("style", marker.style)
        putDouble("centerDarkness", marker.centerDarkness)
      })
    }
  })
  putArray("objectiveDetections", Arguments.createArray().apply {
    objectiveDetections.forEach { detection ->
      pushMap(Arguments.createMap().apply {
        putString("regionUuid", detection.regionUuid)
        putDouble("questionId", detection.questionId.toDouble())
        putString("questionUuid", detection.questionUuid)
        putInt("itemNumber", detection.itemNumber)
        putString("questionType", detection.questionType)
        if (detection.detectedOption == null) {
          putNull("detectedOption")
          putNull("detectedLabel")
        } else {
          putString("detectedOption", detection.detectedOption)
          putString("detectedLabel", detection.detectedLabel)
        }
        putDouble("confidenceScore", detection.confidenceScore)
        putString("detectionStatus", detection.detectionStatus)
        putString("verificationStatus", "pending")
        putBoolean("teacherMayReplaceAnswer", false)
        putMap("rawMarkInformation", Arguments.createMap().apply {
          putArray("markedOptions", Arguments.createArray().apply {
            detection.markedOptions.forEach(::pushString)
          })
          putMap("optionScores", Arguments.createMap().apply {
            detection.optionScores.forEach { (option, score) -> putDouble(option, score) }
          })
          putDouble("scoreGap", detection.scoreGap)
        })
      })
    }
  })
  putArray("writtenEvidence", Arguments.createArray().apply {
    writtenEvidence.forEach { evidence ->
      pushMap(Arguments.createMap().apply {
        putString("regionUuid", evidence.regionUuid)
        putDouble("questionId", evidence.questionId.toDouble())
        putString("questionUuid", evidence.questionUuid)
        putInt("itemNumber", evidence.itemNumber)
        putString("questionType", evidence.questionType)
        putString("evidenceImageUri", evidence.evidenceImageUri)
        putString("evidenceSha256", evidence.evidenceSha256)
        putString("enhancedImageUri", evidence.enhancedImageUri)
        putString("enhancementMethod", evidence.enhancementMethod)
        putString("evidenceStatus", "captured")
        putString("evaluationStatus", evidence.evaluationStatus)
        putBoolean("teacherMayReplaceResponse", false)
      })
    }
  })
}
