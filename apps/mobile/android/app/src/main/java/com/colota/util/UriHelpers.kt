/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns

// Null when the provider doesn't expose DISPLAY_NAME (some cloud providers).
internal fun ContentResolver.queryDisplayName(uri: Uri): String? {
    return try {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null }
    } catch (e: Exception) {
        null
    }
}
