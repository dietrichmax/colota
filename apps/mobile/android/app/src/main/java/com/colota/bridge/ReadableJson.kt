/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import org.json.JSONArray
import org.json.JSONObject

/**
 * Recursive conversion of React Native [ReadableMap] / [ReadableArray] to
 * [JSONObject] / [JSONArray]. Preserves nested structure, null values, and
 * scalar types - safer than the flat `getString`-as-fallback patterns that
 * silently lose nested data.
 */
fun ReadableMap.toJson(): JSONObject {
    val json = JSONObject()
    val it = keySetIterator()
    while (it.hasNextKey()) {
        val key = it.nextKey()
        json.put(key, readableValue(this, key))
    }
    return json
}

fun ReadableArray.toJson(): JSONArray {
    val json = JSONArray()
    for (i in 0 until size()) {
        json.put(readableValue(this, i))
    }
    return json
}

private fun readableValue(map: ReadableMap, key: String): Any = when (map.getType(key)) {
    ReadableType.Null -> JSONObject.NULL
    ReadableType.Boolean -> map.getBoolean(key)
    ReadableType.Number -> map.getDouble(key)
    ReadableType.String -> map.getString(key) ?: JSONObject.NULL
    ReadableType.Map -> map.getMap(key)?.toJson() ?: JSONObject.NULL
    ReadableType.Array -> map.getArray(key)?.toJson() ?: JSONObject.NULL
}

private fun readableValue(array: ReadableArray, i: Int): Any = when (array.getType(i)) {
    ReadableType.Null -> JSONObject.NULL
    ReadableType.Boolean -> array.getBoolean(i)
    ReadableType.Number -> array.getDouble(i)
    ReadableType.String -> array.getString(i) ?: JSONObject.NULL
    ReadableType.Map -> array.getMap(i)?.toJson() ?: JSONObject.NULL
    ReadableType.Array -> array.getArray(i)?.toJson() ?: JSONObject.NULL
}
