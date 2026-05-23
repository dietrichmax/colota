/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

enum class ImportFormat {
    GEOJSON,
    GOOGLE_TIMELINE_LEGACY,
    GOOGLE_TIMELINE_NEW,
    GPX,
    KML,
    CSV,
}

class UnsupportedFormatException(message: String) : Exception(message)
