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
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import com.Colota.util.AppLogger

/** Tracks the connected Bluetooth devices by their ACL broadcasts and hands on the whole set at every change. */
class BluetoothDeviceMonitor(
    private val context: Context,
    private val onDevicesChanged: (Set<String>) -> Unit
) {
    companion object {
        private const val TAG = "ConditionMonitor"
    }

    private var receiver: BroadcastReceiver? = null
    // Main thread only: the receiver and the profile proxy callbacks both land there.
    private val connectedAddresses = mutableSetOf<String>()
    private var generation = 0

    /**
     * ACL broadcasts carry changes only, so the devices already connected when tracking starts are
     * read once from the A2DP and headset proxies, the two profiles a car head unit connects with.
     * The generation drops proxy results that arrive after stop().
     */
    fun start() {
        connectedAddresses.clear()
        if (!hasBluetoothPermission()) {
            AppLogger.w(TAG, "Bluetooth condition needs the Nearby devices permission")
            onDevicesChanged(emptySet())
            return
        }
        val adapter = bluetoothAdapter()
        if (adapter == null) {
            AppLogger.w(TAG, "Bluetooth unavailable on this device")
            onDevicesChanged(emptySet())
            return
        }

        registerReceiver()
        seedConnectedDevices(adapter)
    }

    fun stop() {
        receiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        receiver = null
        generation++
    }

    private fun registerReceiver() {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_ACL_CONNECTED -> {
                        val address = deviceAddressOf(intent) ?: return
                        AppLogger.d(TAG, "Bluetooth device connected")
                        connectedAddresses.add(address)
                        push()
                    }
                    BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                        val address = deviceAddressOf(intent) ?: return
                        AppLogger.d(TAG, "Bluetooth device disconnected")
                        connectedAddresses.remove(address)
                        push()
                    }
                    BluetoothAdapter.ACTION_STATE_CHANGED -> {
                        val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                        if (state == BluetoothAdapter.STATE_TURNING_OFF || state == BluetoothAdapter.STATE_OFF) {
                            AppLogger.d(TAG, "Bluetooth turned off")
                            connectedAddresses.clear()
                            push()
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
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
    }

    @SuppressLint("MissingPermission")
    private fun seedConnectedDevices(adapter: BluetoothAdapter) {
        if (!adapter.isEnabled) {
            push()
            return
        }

        val seedGeneration = generation
        val profiles = listOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET)
        var pending = profiles.size
        fun settle() {
            if (--pending == 0 && seedGeneration == generation) push()
        }

        val listener = object : BluetoothProfile.ServiceListener {
            @SuppressLint("MissingPermission")
            override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                try {
                    if (seedGeneration == generation) {
                        proxy.connectedDevices.forEach { connectedAddresses.add(it.address.uppercase()) }
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

    private fun push() {
        onDevicesChanged(connectedAddresses.toSet())
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
}
