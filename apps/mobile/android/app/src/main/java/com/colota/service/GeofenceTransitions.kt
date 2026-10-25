/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.location.Location
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.SettingsKeys
import com.Colota.util.AppLogger
import com.Colota.util.geo.haversineDistance
import org.json.JSONObject

/**
 * Which enabled geofences the device is in, for reporting only: pausing is decided by
 * [GeofenceHelper.getPauseZone] and never reads this.
 *
 * Enter is the first fix within the radius. Leave takes two fixes in a row further out than
 * radius + accuracy and is dated by the first, so one wild fix cannot report a departure.
 * A geofence with no known state is seeded silently, so turning the report on or adding a zone
 * where the device already is sends no enter.
 */
class GeofenceTransitions(
    private val geofenceHelper: GeofenceHelper,
    private val dbHelper: DatabaseHelper,
) {
    enum class Event(val wireName: String) { ENTER("enter"), LEAVE("leave") }

    data class Transition(val region: GeofenceHelper.Region, val event: Event, val location: Location)

    /** Names of the geofences the device is in, in id order. Read from any thread. */
    @Volatile var insideNames: List<String> = emptyList()
        private set

    private var state: Map<Int, Boolean> = emptyMap()
    private val firstOutside = mutableMapOf<Int, Location>()

    /** Loads the saved state, so points recorded before the next fix carry the right names. */
    fun restore() {
        state = loadState()
        val regions = geofenceHelper.getEnabledRegions() ?: return
        insideNames = regions.filter { state[it.id] == true }.map { it.name }
    }

    /** Forgets every geofence, so the next evaluation seeds without events. */
    fun clear() {
        firstOutside.clear()
        state = emptyMap()
        insideNames = emptyList()
        if (!dbHelper.getSetting(SettingsKeys.GEOFENCE_STATE).isNullOrEmpty()) {
            dbHelper.saveSetting(SettingsKeys.GEOFENCE_STATE, "")
        }
    }

    /** Names of the enabled geofences whose radius holds a point the service placed itself, such as a zone centre. */
    fun namesAt(lat: Double, lon: Double): List<String> =
        geofenceHelper.getEnabledRegions()
            ?.filter { haversineDistance(lat, lon, it.lat, it.lon) <= it.radius }
            ?.map { it.name }
            ?: insideNames

    fun evaluate(location: Location): List<Transition> {
        val regions = geofenceHelper.getEnabledRegions() ?: return emptyList()
        val next = mutableMapOf<Int, Boolean>()
        val transitions = mutableListOf<Transition>()

        for (region in regions) {
            val distance = haversineDistance(location.latitude, location.longitude, region.lat, region.lon)
            val within = distance <= region.radius
            when (state[region.id]) {
                null -> next[region.id] = within
                false -> {
                    next[region.id] = within
                    if (within) transitions.add(Transition(region, Event.ENTER, location))
                }
                true -> {
                    val pending = firstOutside[region.id]
                    when {
                        distance <= region.radius + location.accuracy -> {
                            firstOutside.remove(region.id)
                            next[region.id] = true
                        }
                        pending == null -> {
                            firstOutside[region.id] = location
                            next[region.id] = true
                        }
                        else -> {
                            firstOutside.remove(region.id)
                            next[region.id] = false
                            transitions.add(Transition(region, Event.LEAVE, pending))
                        }
                    }
                }
            }
        }
        firstOutside.keys.retainAll(next.keys)

        if (next != state) saveState(next)
        state = next
        insideNames = regions.filter { next[it.id] == true }.map { it.name }
        transitions.forEach { AppLogger.d(TAG, "Geofence ${it.event.wireName}: #${it.region.id}") }
        return transitions
    }

    private fun loadState(): Map<Int, Boolean> {
        val raw = dbHelper.getSetting(SettingsKeys.GEOFENCE_STATE)
        if (raw.isNullOrEmpty()) return emptyMap()
        return try {
            val json = JSONObject(raw)
            json.keys().asSequence().associate { it.toInt() to json.getBoolean(it) }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Unreadable geofence state, seeding again", e)
            emptyMap()
        }
    }

    private fun saveState(next: Map<Int, Boolean>) {
        val json = JSONObject()
        next.forEach { (id, inside) -> json.put(id.toString(), inside) }
        dbHelper.saveSetting(SettingsKeys.GEOFENCE_STATE, json.toString())
    }

    companion object {
        private const val TAG = "GeofenceTransitions"
    }
}
