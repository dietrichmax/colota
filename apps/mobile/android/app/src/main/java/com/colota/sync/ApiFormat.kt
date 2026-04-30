/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

/**
 * Supported outbound payload formats. FIELD_MAPPED applies the user's fieldMap;
 * TRACCAR_JSON uses fixed internal field names so the wire transform in
 * NetworkManager.buildTraccarJsonPayload can read them back unambiguously.
 *
 * Wire names are the string values persisted in settings and on the JS bridge.
 */
enum class ApiFormat(val wireName: String) {
    FIELD_MAPPED(""),
    TRACCAR_JSON("traccar_json");

    val usesFixedFieldNames: Boolean get() = this == TRACCAR_JSON

    companion object {
        fun fromWire(wire: String?): ApiFormat =
            values().firstOrNull { it.wireName == wire } ?: FIELD_MAPPED
    }
}
