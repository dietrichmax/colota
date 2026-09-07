/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, View, ScrollView, Pressable } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme, type ThemePreference } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import { fontSizes, fonts } from "../styles/typography"
import { Card, ChipGroup, Container, Divider, SettingRow, TextField, ListItem } from "../components"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { logger } from "../utils/logger"
import { loadDisplayPreferences, getUnitSystem, getTimeFormat } from "../utils/geo"
import type { UnitSystem, TimeFormat } from "../utils/geo"
import { space, STATE_LAYER_ALPHA } from "../constants"

export function AppearanceScreen({}: ScreenProps) {
  const { preference, setPreference, colors } = useTheme()
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

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card rows style={showMapTileServer && styles.cardTail}>
          <SettingRow label={t("appearance.theme")}>
            <ChipGroup
              options={[
                { value: "system", label: t("appearance.theme.system"), testID: "theme-system" },
                { value: "light", label: t("appearance.theme.light"), testID: "theme-light" },
                { value: "dark", label: t("appearance.theme.dark"), testID: "theme-dark" }
              ]}
              selected={preference}
              onSelect={(value) => setPreference(value as ThemePreference)}
            />
          </SettingRow>

          <Divider tight />

          <SettingRow label={t("appearance.units")}>
            <ChipGroup
              options={[
                { value: "metric", label: t("appearance.units.metric"), testID: "unit-metric" },
                { value: "imperial", label: t("appearance.units.imperial"), testID: "unit-imperial" }
              ]}
              selected={unitSystem}
              onSelect={selectUnitSystem}
            />
          </SettingRow>

          <Divider tight />

          <SettingRow label={t("appearance.timeFormat")}>
            <ChipGroup
              options={[
                { value: "24h", label: "24h", testID: "time-format-24h" },
                { value: "12h", label: "12h", testID: "time-format-12h" }
              ]}
              selected={timeFormat}
              onSelect={selectTimeFormat}
            />
          </SettingRow>

          <Divider tight />

          <ListItem
            testID="map-tile-server-toggle"
            label={t("appearance.mapTileServer")}
            sub={t("appearance.mapStyle.subtitle")}
            trailingIcon={showMapTileServer ? ChevronUp : ChevronDown}
            expanded={showMapTileServer}
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
                placeholderTextColor={colors.placeholder}
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
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <View style={styles.mapStyleFooter}>
                <Text style={[styles.mapStyleHint, { color: colors.textLight }]}>
                  {t("appearance.mapStyle.emptyHint")}
                </Text>
                {mapStyleUrlLight.trim() || mapStyleUrlDark.trim() ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetMapStyle}
                    android_ripple={{ color: colors.primaryDark + STATE_LAYER_ALPHA, borderless: true }}
                  >
                    <Text style={[styles.mapStyleHint, { color: colors.primary }]}>
                      {t("appearance.mapStyle.reset")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  // rows drops the card\'s vertical padding for the first row; the last child
  // here is not a row, so it takes the bottom inset back.
  cardTail: { paddingBottom: space.lg },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg
  },
  mapTilePanel: {
    marginTop: space.xs,
    paddingBottom: space.xs,
    gap: space.lg
  },
  mapStyleFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  mapStyleHint: {
    fontSize: fontSizes.small,
    ...fonts.regular
  }
})
