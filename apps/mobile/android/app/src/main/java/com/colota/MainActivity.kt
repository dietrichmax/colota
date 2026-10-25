/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.content.res.Configuration
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.appearance.AppearanceModule
import com.facebook.react.uimanager.DisplayMetricsHolder

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // RN outlives this activity while tracking runs; give it the current theme before super.onCreate mounts the app.
    reactHost?.currentReactContext?.getNativeModule(AppearanceModule::class.java)?.onConfigurationChanged(this)
    super.onCreate(null)
    // RN takes display metrics from the phone's screen; use the screen this activity is on.
    DisplayMetricsHolder.initDisplayMetrics(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    DisplayMetricsHolder.initDisplayMetrics(this)
  }

  // RN ScrollView pointerIndex race: getY() on an invalidated pointer mid-gesture.
  override fun dispatchTouchEvent(ev: MotionEvent): Boolean = try {
    super.dispatchTouchEvent(ev)
  } catch (e: IllegalArgumentException) {
    if (e.message?.contains("pointerIndex", ignoreCase = true) == true) {
      Log.w("MainActivity", "Dropped MotionEvent (pointerIndex bug)", e)
      false
    } else throw e
  }

  override fun getMainComponentName(): String = "Colota"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
