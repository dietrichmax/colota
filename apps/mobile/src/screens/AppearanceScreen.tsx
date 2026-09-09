/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { StyleSheet, View, ScrollView } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme, type ThemePreference } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import {
  Button,
  Card,
  ChipGroup,
  Container,
  Divider,
  FieldMessage,
  SettingRow,
  TextField,
  ListItem,
  Toggle
} from "../components"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { logger } from "../utils/logger"
import { loadDisplayPreferences, getUnitSystem, getTimeFormat } from "../utils/geo"
import type { UnitSystem, TimeFormat } from "../utils/geo"
import { clockSample, isStyleUrlValid, tileRowSub, unitNotation } from "../utils/appearance"
import { space } from "../constants"

type StyleKey = "mapStyleUrlLight" | "mapStyleUrlDark"

export function AppearanceScreen({}: ScreenProps) {
  const {
    preference,
    setPreference,
    colors,
    wallpaperColors,
    setWallpaperColors,
    wallpaperColorsAvailable,
    wallpaperPaletteReady
  } = useTheme()
  const { t } = useTranslation()

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(getUnitSystem)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(getTimeFormat)

  // The row sub reads the saved pair, not the drafts, so the host moves on a save and not per keystroke.
  const [draftLight, setDraftLight] = useState("")
  const [draftDark, setDraftDark] = useState("")
  const [savedLight, setSavedLight] = useState("")
  const [savedDark, setSavedDark] = useState("")
  const [lightError, setLightError] = useState<string | undefined>()
  const [darkError, setDarkError] = useState<string | undefined>()
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

  // The initial read must not undo a save that beat it.
  const edited = useRef(false)

  useEffect(() => {
    Promise.all([
      NativeLocationService.getSetting("mapStyleUrlLight"),
      NativeLocationService.getSetting("mapStyleUrlDark")
    ])
      .then(([light, dark]) => {
        if (edited.current) return
        setDraftLight(light ?? "")
        setDraftDark(dark ?? "")
        setSavedLight(light ?? "")
        setSavedDark(dark ?? "")
      })
      .catch(() => {})
  }, [])

  /** Refused rather than stored: a URL the map cannot load blanks every map, and only the reset undoes it. */
  const commitStyleUrl = useCallback(
    async (key: StyleKey, text: string) => {
      const setError = key === "mapStyleUrlLight" ? setLightError : setDarkError
      const setSaved = key === "mapStyleUrlLight" ? setSavedLight : setSavedDark
      const trimmed = text.trim()
      if (!isStyleUrlValid(trimmed)) {
        setError(t("appearance.mapStyle.error"))
        return
      }
      setError(undefined)
      edited.current = true
      try {
        await NativeLocationService.saveSetting(key, trimmed)
        setSaved(trimmed)
      } catch (err) {
        logger.error("[AppearanceScreen] Failed to save map style URL:", err)
      }
    },
    [t]
  )

  const resetMapStyle = useCallback(() => {
    edited.current = true
    setDraftLight("")
    setDraftDark("")
    setSavedLight("")
    setSavedDark("")
    setLightError(undefined)
    setDarkError(undefined)
    Promise.all([
      NativeLocationService.saveSetting("mapStyleUrlLight", ""),
      NativeLocationService.saveSetting("mapStyleUrlDark", "")
    ]).catch((err) => logger.error("[AppearanceScreen] Failed to reset map style URLs:", err))
  }, [])

  const hasCustom = savedLight.trim() !== "" || savedDark.trim() !== ""

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card rows style={showMapTileServer ? (hasCustom ? styles.cardTailButton : styles.cardTail) : undefined}>
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

          {wallpaperColorsAvailable && (
            <>
              <Divider tight />
              {/* Present whenever the platform offers it, so a failed read cannot hide the way to turn it off. */}
              <SettingRow
                label={t("appearance.wallpaperColors")}
                hint={t("appearance.wallpaperColors.hint")}
                disabled={!wallpaperPaletteReady}
              >
                <Toggle
                  testID="wallpaper-colors-toggle"
                  value={wallpaperColors}
                  onValueChange={setWallpaperColors}
                  disabled={!wallpaperPaletteReady}
                  accessibilityLabel={t("appearance.wallpaperColors")}
                />
              </SettingRow>
            </>
          )}

          <Divider tight />

          <SettingRow label={t("appearance.units")} hint={unitNotation(unitSystem)}>
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

          <SettingRow label={t("appearance.timeFormat")} hint={clockSample(timeFormat)}>
            <ChipGroup
              options={[
                { value: "24h", label: t("appearance.timeFormat.24h"), testID: "time-format-24h" },
                { value: "12h", label: t("appearance.timeFormat.12h"), testID: "time-format-12h" }
              ]}
              selected={timeFormat}
              onSelect={selectTimeFormat}
            />
          </SettingRow>

          <Divider tight />

          <ListItem
            testID="map-tile-server-toggle"
            label={t("appearance.mapTileServer")}
            sub={tileRowSub(savedLight, savedDark)}
            subLines={2}
            trailingIcon={showMapTileServer ? ChevronUp : ChevronDown}
            expanded={showMapTileServer}
            onPress={() => setShowMapTileServer(!showMapTileServer)}
          />

          {showMapTileServer && (
            <View style={styles.panel}>
              <View style={styles.fields}>
                <TextField
                  testID="map-style-url-light"
                  label={t("appearance.mapStyle.light")}
                  mono
                  value={draftLight}
                  onChangeText={setDraftLight}
                  onBlur={() => commitStyleUrl("mapStyleUrlLight", draftLight)}
                  error={lightError}
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
                  value={draftDark}
                  onChangeText={setDraftDark}
                  onBlur={() => commitStyleUrl("mapStyleUrlDark", draftDark)}
                  error={darkError}
                  placeholder={t("appearance.mapStyle.placeholder")}
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <FieldMessage>{t("appearance.mapStyle.emptyHint")}</FieldMessage>
              {hasCustom && (
                <Button
                  variant="ghost"
                  shape="rounded"
                  testID="map-style-reset-btn"
                  title={t("appearance.mapStyle.reset")}
                  onPress={resetMapStyle}
                />
              )}
            </View>
          )}
        </Card>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  // `rows` drops the card's vertical padding, and the panel's last child is not a row, so it comes back.
  cardTail: { paddingBottom: space.lg },
  cardTailButton: { paddingBottom: space.sm },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  // Pulled up against the owning row's bottom padding, so it groups with that row and not the next.
  panel: { marginTop: -space.xs },
  fields: {
    gap: space.lg
  }
})
