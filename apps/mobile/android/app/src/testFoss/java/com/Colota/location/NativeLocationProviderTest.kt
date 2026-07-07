/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.content.Context
import android.location.LocationManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class NativeLocationProviderTest {

    private val locationManager: LocationManager =
        ApplicationProvider.getApplicationContext<Context>()
            .getSystemService(Context.LOCATION_SERVICE) as LocationManager

    @Test
    fun `selects the fused provider when the platform has one`() {
        shadowOf(locationManager).setProviderEnabled(LocationManager.FUSED_PROVIDER, true)

        assertEquals(LocationManager.FUSED_PROVIDER, NativeLocationProvider.selectProvider(locationManager))
    }

    @Test
    fun `falls back to gps when the platform ships no fused provider`() {
        shadowOf(locationManager).removeProvider(LocationManager.FUSED_PROVIDER)

        assertEquals(LocationManager.GPS_PROVIDER, NativeLocationProvider.selectProvider(locationManager))
    }

    @Test
    @Config(sdk = [30])
    fun `uses gps below api 31 even if a fused provider is reported`() {
        shadowOf(locationManager).setProviderEnabled(LocationManager.FUSED_PROVIDER, true)

        assertEquals(LocationManager.GPS_PROVIDER, NativeLocationProvider.selectProvider(locationManager))
    }
}
