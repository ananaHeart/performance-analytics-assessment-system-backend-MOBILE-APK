package com.mobileassessmentapp

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(OmrScannerPackage())
          add(V3SecureSessionPackage())
        },
      useDevSupport = BuildConfig.DEBUG,
    )
  }

  override fun onCreate() {
    super.onCreate()
    // The app is light only. Without this, a phone in dark mode makes the
    // full-screen modals (which draw under the system bars) switch to light
    // navigation-bar icons, invisible on their white background.
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
    loadReactNative(this)
  }
}
