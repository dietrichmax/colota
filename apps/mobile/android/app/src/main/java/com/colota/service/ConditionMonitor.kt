/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.pm.PackageManager
import android.os.Build
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import androidx.car.app.connection.CarConnection
import androidx.lifecycle.Observer
import com.Colota.sync.NetworkManager
import com.Colota.util.AppLogger

/**
 * Monitors device conditions (charging state, Android Auto connection, Wi-Fi, Bluetooth)
 * and notifies ProfileManager when conditions change.
 *
 * Android Auto is detected via the [CarConnection] API, which reliably
 * reports projection and native car connections. Wi-Fi transport changes come
 * from the service's [NetworkManager], which tracks connected Wi-Fi networks
 * with a plain (unflagged) callback; a named-network profile reads the name
 * through a one-shot location-flagged probe when that transport changes.
 * Bluetooth devices are tracked by their ACL connection broadcasts.
 *
 * All observers are registered programmatically so they only run while
 * the foreground service is active.
 */
class ConditionMonitor(
    private val context: Context,
    private val networkManager: NetworkManager,
    private val profileManager: ProfileManager
) {
    companion object {
        private const val TAG = "ConditionMonitor"
    }

    private var chargingReceiver: BroadcastReceiver? = null
    private var carConnection: CarConnection? = null
    private var carConnectionObserver: Observer<Int>? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    // Main thread only: invalidates in-flight SSID probes when a newer network change arrives.
    private var wifiPushGeneration = 0
    private var wifiMonitorActive = false
    private var bluetoothReceiver: BroadcastReceiver? = null
    // Main thread only: the receiver and the profile proxy callbacks both land there.
    private val connectedBluetoothAddresses = mutableSetOf<String>()
    private var bluetoothGeneration = 0

    fun start() {
        // Unregister first to prevent duplicate observers on repeated start() calls
        stop()

        val needed = profileManager.getNeededConditionTypes()

        if (ProfileConstants.CONDITION_CHARGING in needed) {
            registerChargingMonitor()
            val charging = readCurrentChargingState()
            profileManager.onChargingStateChanged(charging)
        }

        if (ProfileConstants.CONDITION_ANDROID_AUTO in needed) {
            startCarConnectionMonitor()
        }

        if (ProfileConstants.CONDITION_WIFI_ANY in needed || ProfileConstants.CONDITION_WIFI_SSID in needed) {
            startWifiMonitor()
        }

        if (ProfileConstants.CONDITION_BLUETOOTH_DEVICE in needed) {
            startBluetoothMonitor()
        }

        AppLogger.d(TAG, "Condition monitors started for: ${needed.ifEmpty { setOf("none") }}")
    }

    fun stop() {
        chargingReceiver = unregisterSafely(chargingReceiver)
        stopCarConnectionMonitor()
        networkManager.setWifiStateListener(null)
        wifiMonitorActive = false
        bluetoothReceiver = unregisterSafely(bluetoothReceiver)
        bluetoothGeneration++

        AppLogger.d(TAG, "Condition monitors stopped")
    }

    private fun unregisterSafely(receiver: BroadcastReceiver?): Nothing? {
        receiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        return null
    }

    private fun registerChargingMonitor() {
        chargingReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_POWER_CONNECTED -> {
                        AppLogger.d(TAG, "Power connected")
                        profileManager.onChargingStateChanged(true)
                    }
                    Intent.ACTION_POWER_DISCONNECTED -> {
                        AppLogger.d(TAG, "Power disconnected")
                        profileManager.onChargingStateChanged(false)
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(chargingReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(chargingReceiver, filter)
        }
    }

    private fun startCarConnectionMonitor() {
        try {
            val connection = CarConnection(context)
            carConnection = connection

            val observer = Observer<Int> { connectionType ->
                val connected = connectionType != CarConnection.CONNECTION_TYPE_NOT_CONNECTED
                AppLogger.d(TAG, "CarConnection type: $connectionType (connected: $connected)")
                profileManager.onCarModeStateChanged(connected)
            }
            carConnectionObserver = observer

            mainHandler.post {
                connection.type.observeForever(observer)
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "CarConnection unavailable: ${e.message}")
        }
    }

    private fun stopCarConnectionMonitor() {
        val observer = carConnectionObserver ?: return
        val connection = carConnection ?: return

        mainHandler.post {
            connection.type.removeObserver(observer)
        }

        carConnectionObserver = null
        carConnection = null
    }

    /**
     * Forwards Wi-Fi state changes to the profile manager. The listener is registered before the
     * first read, so a change landing in that window still arrives instead of being missed.
     */
    private fun startWifiMonitor() {
        networkManager.setWifiStateListener {
            mainHandler.post { pushWifiState() }
        }
        wifiMonitorActive = true
        pushWifiState()
    }

    /** A name read while Location was off is blank. */
    fun onLocationEnabled() {
        if (wifiMonitorActive && ProfileConstants.CONDITION_WIFI_SSID in profileManager.getNeededConditionTypes()) pushWifiState()
    }

    /**
     * The transport-only listener above carries no location flag and can stay registered; the
     * network name is read one-shot only when a named-network profile needs it, so the indicator
     * lights for that moment instead of the whole session. The probe targets the Wi-Fi transport,
     * so the name is readable under a VPN too. The generation drops probe results that a newer
     * network change has already superseded.
     */
    private fun pushWifiState() {
        val generation = ++wifiPushGeneration
        val connected = networkManager.isWifiConnected()
        if (connected && ProfileConstants.CONDITION_WIFI_SSID in profileManager.getNeededConditionTypes()) {
            networkManager.readSsidOnce { ssid ->
                mainHandler.post {
                    if (generation == wifiPushGeneration) {
                        profileManager.onWifiStateChanged(networkManager.isWifiConnected(), ssid)
                    }
                }
            }
        } else {
            profileManager.onWifiStateChanged(connected, "")
        }
    }

    /**
     * ACL broadcasts carry changes only, so the devices already connected when tracking starts are
     * read once from the A2DP and headset proxies, the two profiles a car head unit connects with.
     * The generation drops proxy results that arrive after stop().
     */
    private fun startBluetoothMonitor() {
        connectedBluetoothAddresses.clear()
        if (!hasBluetoothPermission()) {
            AppLogger.w(TAG, "Bluetooth condition needs the Nearby devices permission")
            profileManager.onBluetoothDevicesChanged(emptySet())
            return
        }
        val adapter = bluetoothAdapter()
        if (adapter == null) {
            AppLogger.w(TAG, "Bluetooth unavailable on this device")
            profileManager.onBluetoothDevicesChanged(emptySet())
            return
        }

        registerBluetoothReceiver()
        seedConnectedBluetoothDevices(adapter)
    }

    private fun registerBluetoothReceiver() {
        bluetoothReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_ACL_CONNECTED -> {
                        val address = deviceAddressOf(intent) ?: return
                        AppLogger.d(TAG, "Bluetooth device connected")
                        connectedBluetoothAddresses.add(address)
                        pushBluetoothState()
                    }
                    BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                        val address = deviceAddressOf(intent) ?: return
                        AppLogger.d(TAG, "Bluetooth device disconnected")
                        connectedBluetoothAddresses.remove(address)
                        pushBluetoothState()
                    }
                    BluetoothAdapter.ACTION_STATE_CHANGED -> {
                        val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                        if (state == BluetoothAdapter.STATE_TURNING_OFF || state == BluetoothAdapter.STATE_OFF) {
                            AppLogger.d(TAG, "Bluetooth turned off")
                            connectedBluetoothAddresses.clear()
                            pushBluetoothState()
                        }
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
        }
        // Exported on purpose: the Bluetooth module sends these as its own uid, not as system, so a
        // not-exported receiver never gets them. They are protected broadcasts no other app can send.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(bluetoothReceiver, filter)
        }
    }

    @SuppressLint("MissingPermission")
    private fun seedConnectedBluetoothDevices(adapter: BluetoothAdapter) {
        if (!adapter.isEnabled) {
            pushBluetoothState()
            return
        }

        val generation = bluetoothGeneration
        val profiles = listOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET)
        var pending = profiles.size
        fun settle() {
            if (--pending == 0 && generation == bluetoothGeneration) pushBluetoothState()
        }

        val listener = object : BluetoothProfile.ServiceListener {
            @SuppressLint("MissingPermission")
            override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                try {
                    if (generation == bluetoothGeneration) {
                        proxy.connectedDevices.forEach { connectedBluetoothAddresses.add(it.address.uppercase()) }
                    }
                } catch (e: SecurityException) {
                    AppLogger.w(TAG, "Reading connected Bluetooth devices denied: ${e.message}")
                } finally {
                    try { adapter.closeProfileProxy(profile, proxy) } catch (_: Exception) {}
                }
                settle()
            }

            override fun onServiceDisconnected(profile: Int) {}
        }

        profiles.forEach { profile ->
            val requested = try {
                adapter.getProfileProxy(context, listener, profile)
            } catch (e: Exception) {
                AppLogger.w(TAG, "Bluetooth profile $profile proxy unavailable: ${e.message}")
                false
            }
            if (!requested) settle()
        }
    }

    private fun pushBluetoothState() {
        profileManager.onBluetoothDevicesChanged(connectedBluetoothAddresses.toSet())
    }

    private fun deviceAddressOf(intent: Intent): String? {
        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
        }
        return device?.address?.uppercase()
    }

    private fun bluetoothAdapter(): BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private fun hasBluetoothPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    private fun readCurrentChargingState(): Boolean {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
               status == BatteryManager.BATTERY_STATUS_FULL
    }
}
