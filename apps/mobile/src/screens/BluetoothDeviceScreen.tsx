/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView, StyleSheet, AppState, Linking } from "react-native"
import { Bluetooth, BluetoothOff } from "lucide-react-native"
import { Card, Container, EmptyState, RadioRow } from "../components"
import { useTheme } from "../hooks/useTheme"
import { useTimeout } from "../hooks/useTimeout"
import NativeLocationService from "../services/NativeLocationService"
import {
  checkBluetoothPermission,
  requestBluetoothPermission,
  type BluetoothPermissionResult
} from "../services/LocationServicePermission"
import type { BluetoothDeviceInfo } from "../types/global"
import { BLUETOOTH_REREAD_MS, space } from "../constants"
import { fontSizes, fonts, lineHeights } from "../styles/typography"
import type { RootScreenProps } from "../types/navigation"
import { useTranslation } from "../i18n/useTranslation"

const openBluetoothSettings = () => Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS")

export function BluetoothDeviceScreen({ navigation, route }: RootScreenProps<"Bluetooth Device">) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const pickedDevice = route.params?.selected
  const [btPermission, setBtPermission] = useState<BluetoothPermissionResult | null>(null)
  const [pairedDevices, setPairedDevices] = useState<BluetoothDeviceInfo[]>([])
  const [bluetoothOff, setBluetoothOff] = useState(false)
  const bluetoothReread = useTimeout()

  const refreshPairedDevices = useCallback(async () => {
    const granted = await checkBluetoothPermission()
    const devices = granted ? await NativeLocationService.getBondedBluetoothDevices() : []
    // A denial already seen stays "blocked", so the button keeps pointing at app settings.
    setBtPermission((prev) => (granted ? "granted" : prev === "blocked" ? "blocked" : "denied"))
    setBluetoothOff(devices === null)
    setPairedDevices(devices ?? [])
  }, [])

  useEffect(() => {
    // Opening the picker is the moment to ask, so a first visit shows the dialog instead of a denial.
    requestBluetoothPermission().then((result) => {
      setBtPermission(result)
      refreshPairedDevices()
    })
    // Pairing a device or granting the permission in settings and coming back should list it.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPairedDevices()
    })
    // Quick Settings opens over the app without pausing it, so only a focus event follows a toggle there.
    const focusSub = AppState.addEventListener("focus", () => {
      refreshPairedDevices()
      bluetoothReread.set(refreshPairedDevices, BLUETOOTH_REREAD_MS)
    })
    return () => {
      sub.remove()
      focusSub.remove()
      bluetoothReread.clear()
    }
  }, [refreshPairedDevices, bluetoothReread])

  const handleDevice = (device: BluetoothDeviceInfo) =>
    navigation.popTo("Profile Editor", { bluetoothDevice: device }, { merge: true })

  // A picked device that was unpaired since still shows, so the profile never loses it silently.
  const deviceRows =
    pickedDevice && !pairedDevices.some((d) => d.address === pickedDevice.address)
      ? [
          { ...pickedDevice, unpaired: btPermission === "granted" && !bluetoothOff },
          ...pairedDevices.map((d) => ({ ...d, unpaired: false }))
        ]
      : pairedDevices.map((d) => ({ ...d, unpaired: false }))

  const handleAllowBluetooth = async () => {
    if (btPermission === "blocked") {
      Linking.openSettings()
      return
    }
    const result = await requestBluetoothPermission()
    setBtPermission(result)
    if (result === "granted") refreshPairedDevices()
  }

  // The centred shape is for a state that owns the screen; above a stored device it stays one line.
  const emptyIcon = (icon: typeof Bluetooth) => (deviceRows.length === 0 ? icon : undefined)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("profileEditor.bluetooth.hint")}</Text>
        {btPermission !== null && btPermission !== "granted" && (
          <EmptyState
            icon={emptyIcon(Bluetooth)}
            title={t("profileEditor.bluetooth.permission.title")}
            hint={t("profileEditor.bluetooth.permission")}
            action={{
              label:
                btPermission === "blocked"
                  ? t("profileEditor.bluetooth.openSettings")
                  : t("profileEditor.bluetooth.allow"),
              onPress: handleAllowBluetooth
            }}
          />
        )}
        {btPermission === "granted" && bluetoothOff && (
          <EmptyState
            icon={emptyIcon(BluetoothOff)}
            title={t("profileEditor.bluetooth.off")}
            hint={t("profileEditor.bluetooth.off.hint")}
            action={{ label: t("profileEditor.bluetooth.openBluetoothSettings"), onPress: openBluetoothSettings }}
          />
        )}
        {btPermission === "granted" && !bluetoothOff && pairedDevices.length === 0 && (
          <EmptyState
            icon={emptyIcon(Bluetooth)}
            title={t("profileEditor.bluetooth.noDevices")}
            hint={t("profileEditor.bluetooth.noDevices.hint")}
            action={{ label: t("profileEditor.bluetooth.openBluetoothSettings"), onPress: openBluetoothSettings }}
          />
        )}
        {deviceRows.length > 0 && (
          <Card rows>
            <View accessibilityRole="radiogroup">
              {deviceRows.map((device) => (
                <RadioRow
                  key={device.address}
                  testID={`bluetooth-device-${device.address}`}
                  label={device.name}
                  sub={device.unpaired ? t("profileEditor.bluetooth.unpaired") : device.address}
                  selected={pickedDevice?.address === device.address}
                  onPress={() => handleDevice({ name: device.name, address: device.address })}
                />
              ))}
            </View>
          </Card>
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl },
  intro: { fontSize: fontSizes.body, ...fonts.regular, lineHeight: lineHeights.body, marginBottom: space.lg }
})
