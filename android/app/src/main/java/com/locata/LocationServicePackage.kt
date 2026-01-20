/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.Collections

/**
 * Exposes the [LocationServiceModule] to the React Native JS bridge.
 * Optimized for minimal overhead during app initialization.
 */
class LocationServicePackage : ReactPackage {

    /**
     * Registers the Native Modules provided by this package.
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            LocationServiceModule(reactContext),
            BuildConfigModule(reactContext)
        )
    }

    /**
     * Registers any Custom View Managers (UI components). 
     * Since this is a background service package, we return an empty list.
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}