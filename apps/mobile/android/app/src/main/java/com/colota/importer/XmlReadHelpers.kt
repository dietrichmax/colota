/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import org.xmlpull.v1.XmlPullParser

internal fun XmlPullParser.readTextOrNull(): String? {
    val event = next()
    if (event != XmlPullParser.TEXT) return null
    val value = text?.trim()?.takeIf { it.isNotEmpty() }
    next()
    return value
}

internal fun XmlPullParser.skipElement() {
    if (eventType != XmlPullParser.START_TAG) return
    var depth = 1
    while (depth > 0) {
        when (next()) {
            XmlPullParser.END_TAG -> depth--
            XmlPullParser.START_TAG -> depth++
            XmlPullParser.END_DOCUMENT -> return
        }
    }
}
