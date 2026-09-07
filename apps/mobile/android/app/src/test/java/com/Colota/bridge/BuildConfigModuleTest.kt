/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class BuildConfigModuleTest {

    private lateinit var module: BuildConfigModule
    private var resolved: Any? = NOT_SETTLED

    // The theme reads exactly these steps. One dropped here is an undefined colour in a style prop
    // on the JS side, so the set is asserted rather than sampled.
    private val expectedSteps = setOf(
        "accent1_100", "accent1_200", "accent1_300", "accent1_600", "accent1_700", "accent1_800",
        "accent1_900",
        "neutral1_0", "neutral1_50", "neutral1_600", "neutral1_700", "neutral1_800", "neutral1_900",
        "neutral2_100", "neutral2_200", "neutral2_300", "neutral2_400", "neutral2_500",
        "neutral2_600", "neutral2_700", "neutral2_800"
    )

    @Before
    fun setUp() {
        // WritableNativeMap needs the RN native lib, which no unit test has.
        mockkStatic(Arguments::class)
        every { Arguments.createMap() } answers { JavaOnlyMap() }
        val context: Context = ApplicationProvider.getApplicationContext()
        module = BuildConfigModule(BridgeReactContext(context))
        resolved = NOT_SETTLED
    }

    @After
    fun tearDown() {
        unmockkStatic(Arguments::class)
    }

    @Test
    fun `resolves every tonal step the theme reads`() {
        module.getSystemPalette(capturingPromise())

        assertEquals(expectedSteps, (resolved as WritableMap).toHashMap().keys)
    }

    @Test
    fun `resolves opaque six-digit hex, because the theme appends its own alpha`() {
        module.getSystemPalette(capturingPromise())

        for ((step, value) in (resolved as WritableMap).toHashMap()) {
            assertTrue("$step is $value", Regex("^#[0-9A-F]{6}$").matches(value as String))
        }
    }

    @Test
    @Config(sdk = [30])
    fun `resolves null below API 31, where the framework has no wallpaper palette`() {
        module.getSystemPalette(capturingPromise())

        assertNull(resolved)
    }

    private fun capturingPromise(): Promise {
        val promise = mockk<Promise>()
        every { promise.resolve(any()) } answers { resolved = firstArg<Any?>() }
        return promise
    }

    private companion object {
        // Distinguishes "resolved with null" from "never settled", which assertNull cannot.
        val NOT_SETTLED = Any()
    }
}
