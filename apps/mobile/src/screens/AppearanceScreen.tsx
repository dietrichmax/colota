/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { StyleSheet, View, ScrollView } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import {
  Button,
  ChipGroup,
  Container,
  Divider,
  FieldMessage,
  ListItem,
  SettingRow,
  TextField,
  Toggle
} from "../components"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { logger } from "../utils/logger"
import { loadDisplayPreferences, getUnitSystem, getTimeFormat } from "../utils/geo"
import type { UnitSystem, TimeFormat } from "../utils/geo"
import { space } from "../constants"

export function AppearanceScreen({}: ScreenProps) {
  const { mode, toggleTheme } = useTheme()
  const { t } = useTranslation()

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(getUnitSystem)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(getTimeFormat)

  const [mapStyleUrlLight, setMapStyleUrlLight] = useState("")
  const [mapStyleUrlDark, setMapStyleUrlDark] = useState("")
  const [showMapTileServer, setShowMapTileServer] = useState(false)

  const selectUnitSystem = useCallback(
    async (value: UnitSystem) => {
      const prev = unitSystem
      setUnitSystem(value)
      try {
        await NativeLocationService.saveSetting("unitSystem", value)
        await loadDisplayPreferences()
      } catch {
        setUnitSystem(prev)
      }
    },
    [unitSystem]
  )

  const selectTimeFormat = useCallback(
    async (value: TimeFormat) => {
      const prev = timeFormat
      setTimeFormat(value)
      try {
        await NativeLocationService.saveSetting("timeFormat", value)
        await loadDisplayPreferences()
      } catch {
        setTimeFormat(prev)
      }
    },
    [timeFormat]
  )

  useEffect(() => {
    Promise.all([
      NativeLocationService.getSetting("mapStyleUrlLight"),
      NativeLocationService.getSetting("mapStyleUrlDark")
    ])
      .then(([light, dark]) => {
        setMapStyleUrlLight(light ?? "")
        setMapStyleUrlDark(dark ?? "")
      })
      .catch(() => {})
  }, [])

  const saveMapStyleUrl = useCallback(async (key: "mapStyleUrlLight" | "mapStyleUrlDark", value: string) => {
    try {
      await NativeLocationService.saveSetting(key, value.trim())
    } catch (err) {
      logger.error("[AppearanceScreen] Failed to save map style URL:", err)
    }
  }, [])

  const resetMapStyle = useCallback(() => {
    setMapStyleUrlLight("")
    setMapStyleUrlDark("")
    Promise.all([
      NativeLocationService.saveSetting("mapStyleUrlLight", ""),
      NativeLocationService.saveSetting("mapStyleUrlDark", "")
    ]).catch((err) => logger.error("[AppearanceScreen] Failed to reset map style URLs:", err))
  }, [])

  const hasCustomMapStyle = Boolean(mapStyleUrlLight.trim() || mapStyleUrlDark.trim())

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SettingRow label={t("appearance.darkMode")} divider>
          <Toggle
            testID="dark-mode-switch"
            value={mode === "dark"}
            onValueChange={toggleTheme}
            accessibilityLabel={t("appearance.darkMode")}
          />
        </SettingRow>

        <View style={styles.chipBlock}>
          <ChipGroup
            label={t("appearance.units")}
            options={[
              { value: "metric", label: t("appearance.units.metric"), testID: "unit-metric" },
              { value: "imperial", label: t("appearance.units.imperial"), testID: "unit-imperial" }
            ]}
            selected={unitSystem}
            onSelect={selectUnitSystem}
          />
        </View>

        <Divider tight />

        <View style={styles.chipBlock}>
          <ChipGroup
            label={t("appearance.timeFormat")}
            options={[
              { value: "24h", label: "24h", testID: "time-format-24h" },
              { value: "12h", label: "12h", testID: "time-format-12h" }
            ]}
            selected={timeFormat}
            onSelect={selectTimeFormat}
          />
        </View>

        <Divider tight />

        <ListItem
          testID="map-tile-server-toggle"
          label={t("appearance.mapTileServer")}
          sub={t("appearance.mapStyle.subtitle")}
          trailingIcon={showMapTileServer ? ChevronUp : ChevronDown}
          onPress={() => setShowMapTileServer(!showMapTileServer)}
        />

        {showMapTileServer && (
          <View style={styles.mapTilePanel}>
            <TextField
              testID="map-style-url-light"
              label={t("appearance.mapStyle.light")}
              mono
              value={mapStyleUrlLight}
              onChangeText={setMapStyleUrlLight}
              onBlur={() => saveMapStyleUrl("mapStyleUrlLight", mapStyleUrlLight)}
              placeholder={t("appearance.mapStyle.placeholder")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <TextField
              testID="map-style-url-dark"
              label={t("appearance.mapStyle.dark")}
              mono
              value={mapStyleUrlDark}
              onChangeText={setMapStyleUrlDark}
              onBlur={() => saveMapStyleUrl("mapStyleUrlDark", mapStyleUrlDark)}
              placeholder={t("appearance.mapStyle.placeholder")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              containerStyle={styles.secondField}
            />

            <FieldMessage>{t("appearance.mapStyle.emptyHint")}</FieldMessage>

            {hasCustomMapStyle && (
              <Button
                title={t("appearance.mapStyle.reset")}
                variant="ghost"
                align="start"
                onPress={resetMapStyle}
                style={styles.resetButton}
              />
            )}
          </View>
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  chipBlock: {
    paddingVertical: space.md
  },
  mapTilePanel: {
    paddingTop: space.lg
  },
  secondField: {
    marginTop: space.lg
  },
  resetButton: {
    marginTop: space.sm
  }
})
