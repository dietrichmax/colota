package com.Colota.triggers

import com.Colota.service.LocationForegroundService
import com.Colota.service.NotificationHelper
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class TrackingControlTest {

    @Test
    fun `a stop goes through the service and carries its reason by name`() {
        val app = RuntimeEnvironment.getApplication()

        TrackingControl.stop(app, NotificationHelper.StopReason.AUTOMATION)

        val started = shadowOf(app).nextStartedService
        assertEquals(LocationForegroundService.ACTION_STOP_REQUEST, started.action)
        assertEquals("AUTOMATION", started.getStringExtra(LocationForegroundService.EXTRA_STOP_REASON))
    }
}
