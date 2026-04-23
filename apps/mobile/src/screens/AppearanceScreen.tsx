/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { Text, StyleSheet, Switch, View, ScrollView, Pressable, TextInput } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { fonts } from "../styles/typography"
import { Card, Container, Divider, SettingRow } from "../components"
import { ChevronDown, ChevronUp } from "lucide-react-native"
import { logger } from "../utils/logger"
import { loadDisplayPreferences, getUnitSystem, getTimeFormat } from "../utils/geo"
import type { UnitSystem, TimeFormat } from "../utils/geo"

export function AppearanceScreen({}: ScreenProps) {
  const { mode, toggleTheme, colors } = useTheme()

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
        <Card>
          <SettingRow label="Dark Mode">
            <Switch
              testID="dark-mode-switch"
              value={mode === "dark"}
              onValueChange={toggleTheme}
              trackColor={{
                false: colors.border,
                true: colors.primary + "80"
              }}
              thumbColor={mode === "dark" ? colors.primary : colors.border}
            />
          </SettingRow>

          <Divider />

          <SettingRow label="Units">
            <View style={styles.chipGroup}>
              {(["metric", "imperial"] as const).map((unit) => {
                const selected = unitSystem === unit
                return (
                  <Pressable
                    key={unit}
                    testID={`unit-${unit}`}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primary + "15" : colors.background,
                        borderColor: selected ? colors.primary : colors.border
                      }
                    ]}
                    onPress={() => selectUnitSystem(unit)}
                  >
                    <Text style={[styles.chipLabel, { color: selected ? colors.primary : colors.text }]}>
                      {unit === "metric" ? "Metric" : "Imperial"}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </SettingRow>

          <Divider />

          <SettingRow label="Time Format">
            <View style={styles.chipGroup}>
              {(["24h", "12h"] as const).map((fmt) => {
                const selected = timeFormat === fmt
                return (
                  <Pressable
                    key={fmt}
                    testID={`time-format-${fmt}`}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primary + "15" : colors.background,
                        borderColor: selected ? colors.primary : colors.border
                      }
                    ]}
                    onPress={() => selectTimeFormat(fmt)}
                  >
                    <Text style={[styles.chipLabel, { color: selected ? colors.primary : colors.text }]}>{fmt}</Text>
                  </Pressable>
                )
              })}
            </View>
          </SettingRow>

          <Divider />

          <Pressable
            testID="map-tile-server-toggle"
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: colors.pressedOpacity }]}
            onPress={() => setShowMapTileServer(!showMapTileServer)}
          >
            <View style={styles.linkContent}>
              <Text style={[styles.linkLabel, { color: colors.text }]}>Map Tile Server</Text>
              <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                Override the default map tile source
              </Text>
            </View>
            {showMapTileServer ? (
              <ChevronUp size={20} color={colors.textLight} />
            ) : (
              <ChevronDown size={20} color={colors.textLight} />
            )}
          </Pressable>

          {showMapTileServer && (
            <View style={styles.mapTilePanel}>
              <Text style={[styles.mapStyleSub, styles.mapStyleSubFirst, { color: colors.textSecondary }]}>
                Light style URL
              </Text>
              <TextInput
                testID="map-style-url-light"
                style={[
                  styles.mapStyleInput,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }
                ]}
                value={mapStyleUrlLight}
                onChangeText={setMapStyleUrlLight}
                onBlur={() => saveMapStyleUrl("mapStyleUrlLight", mapStyleUrlLight)}
                placeholder="Default"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={[styles.mapStyleSub, styles.mapStyleSubSecond, { color: colors.textSecondary }]}>
                Dark style URL
              </Text>
              <TextInput
                testID="map-style-url-dark"
                style={[
                  styles.mapStyleInput,
                  { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }
                ]}
                value={mapStyleUrlDark}
                onChangeText={setMapStyleUrlDark}
                onBlur={() => saveMapStyleUrl("mapStyleUrlDark", mapStyleUrlDark)}
                placeholder="Default"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <View style={styles.mapStyleFooter}>
                <Text style={[styles.mapStyleHint, { color: colors.textLight }]}>Leave empty to use the default</Text>
                {mapStyleUrlLight.trim() || mapStyleUrlDark.trim() ? (
                  <Pressable
                    onPress={resetMapStyle}
                    style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
                  >
                    <Text style={[styles.mapStyleHint, { color: colors.primary }]}>Reset to default</Text>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12
  },
  linkContent: {
    flex: 1
  },
  linkLabel: {
    fontSize: 16,
    ...fonts.semiBold,
    marginBottom: 2
  },
  linkSub: {
    fontSize: 13,
    ...fonts.regular
  },
  chipGroup: {
    flexDirection: "row",
    gap: 8
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5
  },
  chipLabel: {
    fontSize: 13,
    ...fonts.semiBold
  },
  mapTilePanel: {
    marginTop: 4,
    paddingBottom: 4
  },
  mapStyleSub: {
    fontSize: 12,
    ...fonts.medium,
    marginBottom: 6
  },
  mapStyleSubFirst: { marginTop: 12 },
  mapStyleSubSecond: { marginTop: 10 },
  mapStyleInput: {
    borderWidth: 1.5,
    padding: 12,
    borderRadius: 12,
    fontSize: 13,
    ...fonts.regular
  },
  mapStyleFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8
  },
  mapStyleHint: {
    fontSize: 11,
    ...fonts.regular
  }
})
