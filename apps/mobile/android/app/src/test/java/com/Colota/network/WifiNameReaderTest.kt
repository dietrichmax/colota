package com.Colota.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import io.mockk.*
import org.junit.Assert.assertEquals
import org.junit.Test

/** The stubbed android.jar reports SDK 0, so these run the WifiManager path used below S. */
class WifiNameReaderTest {

    private val cm = mockk<ConnectivityManager>(relaxed = true)

    private fun readerWith(ssid: String?): WifiNameReader {
        val ctx = mockk<Context>(relaxed = true)
        val wifi = ssid?.let { name ->
            val info = mockk<WifiInfo>(relaxed = true)
            every { info.ssid } returns name
            mockk<WifiManager>(relaxed = true).also { every { it.connectionInfo } returns info }
        }
        every { ctx.getSystemService(Context.WIFI_SERVICE) } returns wifi
        return WifiNameReader(ctx, cm)
    }

    /** Android wraps a UTF-8 name in quotes; the picker and the condition compare the bare name. */
    @Test
    fun `a name reads without its quotes`() {
        assertEquals("Home", readerWith("\"Home\"").read(null))
    }

    @Test
    fun `a device without Wi-Fi reads as no name`() {
        assertEquals("", readerWith(null).read(null))
    }

    /** Below S the callback carries no name, so waiting on one would only stall the picker. */
    @Test
    fun `below S a probe answers from WifiManager without registering a callback`() {
        var answer: String? = null

        readerWith("\"Home\"").probe(mockk(relaxed = true)) { answer = it }

        assertEquals("Home", answer)
        verify(exactly = 0) { cm.registerNetworkCallback(any(), any<ConnectivityManager.NetworkCallback>()) }
    }
}
