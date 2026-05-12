/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

/** Reports STATIONARY/MOVING transitions for the foreground service to pause and resume GPS. */
interface MotionStateDetector {
    fun start(listener: (MotionState) -> Unit)
    fun stop()
    val isAvailable: Boolean
}

enum class MotionState { STATIONARY, MOVING }
