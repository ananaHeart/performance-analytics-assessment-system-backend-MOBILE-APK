package com.mobileassessmentapp

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class V3SecureSessionModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val MODULE_NAME = "V3SecureSession"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "mobile_assessment_v3_session_v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val PREFERENCES_NAME = "v3_secure_session_ciphertext"
    private const val IV_KEY = "iv"
    private const val CIPHERTEXT_KEY = "ciphertext"
    private const val RECORD_VERSION_KEY = "version"
    private const val RECORD_VERSION = 1
    private const val MAX_PLAINTEXT_BYTES = 64 * 1024
    private const val AUTH_TAG_BITS = 128
    private val ADDITIONAL_AUTHENTICATED_DATA =
      "com.mobileassessmentapp.v3.secure-session.v1".toByteArray(StandardCharsets.UTF_8)

    // Separate key and AAD for encrypting other local data (e.g. cached answer
    // keys) so it can never be confused with, or clear, the session record.
    private const val LOCAL_DATA_KEY_ALIAS = "mobile_assessment_v3_local_data_v1"
    private const val MAX_LOCAL_DATA_BYTES = 4 * 1024 * 1024
    private val LOCAL_DATA_AAD =
      "com.mobileassessmentapp.v3.local-data.v1".toByteArray(StandardCharsets.UTF_8)
  }

  private val executor = Executors.newSingleThreadExecutor()
  private val preferences = reactContext.getSharedPreferences(
    PREFERENCES_NAME,
    Context.MODE_PRIVATE,
  )

  override fun getName(): String = MODULE_NAME

  override fun getConstants(): Map<String, Any> = mapOf(
    "localV3Backend" to BuildConfig.LOCAL_V3_BACKEND,
  )

  @ReactMethod
  fun save(value: String, promise: Promise) {
    executor.execute {
      try {
        val plaintext = value.toByteArray(StandardCharsets.UTF_8)
        require(plaintext.isNotEmpty()) { "The secure V3 session cannot be empty." }
        require(plaintext.size <= MAX_PLAINTEXT_BYTES) {
          "The secure V3 session exceeds the storage limit."
        }

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(ADDITIONAL_AUTHENTICATED_DATA)
        val ciphertext = cipher.doFinal(plaintext)
        val committed = preferences.edit()
          .putInt(RECORD_VERSION_KEY, RECORD_VERSION)
          .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
          .putString(CIPHERTEXT_KEY, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
          .commit()
        check(committed) { "Unable to commit the encrypted V3 session." }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
          "V3_SECURE_SESSION_SAVE_FAILED",
          "Unable to protect the V3 session with Android Keystore.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun load(promise: Promise) {
    executor.execute {
      try {
        val ivText = preferences.getString(IV_KEY, null)
        val ciphertextText = preferences.getString(CIPHERTEXT_KEY, null)
        if (ivText == null || ciphertextText == null) {
          promise.resolve(null)
          return@execute
        }
        check(preferences.getInt(RECORD_VERSION_KEY, -1) == RECORD_VERSION) {
          "Unsupported secure V3 session version."
        }
        val iv = Base64.decode(ivText, Base64.NO_WRAP)
        val ciphertext = Base64.decode(ciphertextText, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
          Cipher.DECRYPT_MODE,
          getOrCreateKey(),
          GCMParameterSpec(AUTH_TAG_BITS, iv),
        )
        cipher.updateAAD(ADDITIONAL_AUTHENTICATED_DATA)
        val plaintext = cipher.doFinal(ciphertext)
        promise.resolve(String(plaintext, StandardCharsets.UTF_8))
      } catch (error: Exception) {
        preferences.edit().clear().commit()
        promise.reject(
          "V3_SECURE_SESSION_LOAD_FAILED",
          "The protected V3 session could not be restored and was cleared.",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    executor.execute {
      try {
        check(preferences.edit().clear().commit()) {
          "Unable to clear the encrypted V3 session."
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(
          "V3_SECURE_SESSION_CLEAR_FAILED",
          "Unable to clear the protected V3 session.",
          error,
        )
      }
    }
  }

  /** Returns "base64(iv):base64(ciphertext)" encrypted with the local-data key. */
  @ReactMethod
  fun encryptText(value: String, promise: Promise) {
    executor.execute {
      try {
        val plaintext = value.toByteArray(StandardCharsets.UTF_8)
        require(plaintext.size <= MAX_LOCAL_DATA_BYTES) {
          "The value exceeds the local encryption size limit."
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(LOCAL_DATA_KEY_ALIAS))
        cipher.updateAAD(LOCAL_DATA_AAD)
        val ciphertext = cipher.doFinal(plaintext)
        promise.resolve(
          Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ciphertext, Base64.NO_WRAP),
        )
      } catch (error: Exception) {
        promise.reject("V3_LOCAL_ENCRYPT_FAILED", "Unable to encrypt local data.", error)
      }
    }
  }

  @ReactMethod
  fun decryptText(value: String, promise: Promise) {
    executor.execute {
      try {
        val separator = value.indexOf(':')
        require(separator > 0) { "The encrypted value is malformed." }
        val iv = Base64.decode(value.substring(0, separator), Base64.NO_WRAP)
        val ciphertext = Base64.decode(value.substring(separator + 1), Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
          Cipher.DECRYPT_MODE,
          getOrCreateKey(LOCAL_DATA_KEY_ALIAS),
          GCMParameterSpec(AUTH_TAG_BITS, iv),
        )
        cipher.updateAAD(LOCAL_DATA_AAD)
        promise.resolve(String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8))
      } catch (error: Exception) {
        promise.reject("V3_LOCAL_DECRYPT_FAILED", "Unable to decrypt local data.", error)
      }
    }
  }

  private fun getOrCreateKey(alias: String = KEY_ALIAS): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES,
      ANDROID_KEYSTORE,
    )
    generator.init(
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }
}
