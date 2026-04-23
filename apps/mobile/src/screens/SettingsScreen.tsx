/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { StyleSheet, View, ScrollView, Linking, DeviceEventEmitter } from "react-native"
import { TRACKING_PRESETS, API_TEMPLATES } from "../types/global"
import type { RootScreenProps } from "../types/navigation"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { SectionTitle, Card, Container, Divider, StatsCard, ListItem } from "../components"
import {
  ExternalLink,
  Cloud,
  Navigation,
  Braces,
  UserRoundPen,
  Palette,
  Database,
  Download,
  Map,
  ScrollText,
  Info,
  Heart
} from "lucide-react-native"
import { logger } from "../utils/logger"

type Props = RootScreenProps<"Settings">

export function SettingsScreen({ navigation }: Props) {
  const { settings } = useTracking()

  const [queueCount, setQueueCount] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)

  const updateStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats()
      setQueueCount(stats.queued)
      setSentCount(stats.sent)
      setTodayCount(stats.today)
    } catch (err) {
      logger.error("[SettingsScreen] Failed to get stats:", err)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      updateStats()
      const subs = [
        DeviceEventEmitter.addListener("onLocationUpdate", updateStats),
        DeviceEventEmitter.addListener("onSyncProgress", updateStats),
        DeviceEventEmitter.addListener("onSyncError", updateStats)
      ]
      return () => subs.forEach((s) => s.remove())
    }, [updateStats])
  )

  useEffect(() => {
    updateStats()
  }, [settings.isOfflineMode, settings.endpoint, updateStats])

  const connectionSummary = useMemo(() => {
    if (settings.isOfflineMode) return "Offline - saved locally"
    if (!settings.endpoint) return "No server configured"
    try {
      return new URL(settings.endpoint).host
    } catch {
      return settings.endpoint
    }
  }, [settings.isOfflineMode, settings.endpoint])

  const syncSummary = useMemo(() => {
    const preset = settings.syncPreset
    if (preset !== "custom" && TRACKING_PRESETS[preset]) {
      return `${TRACKING_PRESETS[preset].label} · every ${settings.interval}s`
    }
    return `Custom · every ${settings.interval}s`
  }, [settings.syncPreset, settings.interval])

  const apiSummary = useMemo(() => {
    const template = settings.apiTemplate
    if (template === "custom") {
      const fieldCount = Object.values(settings.fieldMap).filter(Boolean).length + settings.customFields.length
      return `Custom (${fieldCount} field${fieldCount === 1 ? "" : "s"})`
    }
    return API_TEMPLATES[template]?.label ?? "Custom"
  }, [settings.apiTemplate, settings.fieldMap, settings.customFields])

  const handleNavigateDataManagement = useCallback(() => {
    navigation.navigate("Data Management")
  }, [navigation])

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StatsCard
          queueCount={queueCount}
          sentCount={sentCount}
          todayCount={todayCount}
          interval={settings.interval.toString()}
          onManageClick={handleNavigateDataManagement}
        />

        <View style={styles.section}>
          <Card>
            <ListItem
              testID="nav-connection"
              icon={Cloud}
              label="Connection"
              sub={connectionSummary}
              onPress={() => navigation.navigate("Connection")}
            />
            <Divider />
            <ListItem
              testID="nav-tracking-sync"
              icon={Navigation}
              label="Tracking & Sync"
              sub={syncSummary}
              onPress={() => navigation.navigate("Tracking & Sync")}
            />
            {!settings.isOfflineMode && (
              <>
                <Divider />
                <ListItem
                  testID="nav-api-config"
                  icon={Braces}
                  label="API Field Mapping"
                  sub={apiSummary}
                  onPress={() => navigation.navigate("API Config")}
                />
              </>
            )}
            <Divider />
            <ListItem
              testID="nav-tracking-profiles"
              icon={UserRoundPen}
              label="Tracking Profiles"
              sub="Auto-switch GPS settings based on conditions"
              onPress={() => navigation.navigate("Tracking Profiles")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Display</SectionTitle>
          <Card>
            <ListItem
              testID="nav-appearance"
              icon={Palette}
              label="Appearance"
              sub="Theme, units, time format and map tiles"
              onPress={() => navigation.navigate("Appearance")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Data</SectionTitle>
          <Card>
            <ListItem
              testID="nav-data-management"
              icon={Database}
              label="Data Management"
              sub="View queue and clear data"
              onPress={() => navigation.navigate("Data Management")}
            />
            <Divider />
            <ListItem
              testID="nav-export-data"
              icon={Download}
              label="Export Data"
              sub="Export locations as CSV, GeoJSON, GPX or KML"
              onPress={() => navigation.navigate("Export Data")}
            />
            <Divider />
            <ListItem
              testID="nav-offline-maps"
              icon={Map}
              label="Offline Maps"
              sub="Download map tiles for use without internet"
              onPress={() => navigation.navigate("Offline Maps")}
            />
            <Divider />
            <ListItem
              testID="nav-activity-log"
              icon={ScrollText}
              label="Activity Log"
              sub="View and export debug logs"
              onPress={() => navigation.navigate("Activity Log")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <Card>
            <ListItem
              testID="nav-about"
              icon={Info}
              label="About Colota"
              sub="Version, licenses and links"
              onPress={() => navigation.navigate("About Colota")}
            />
            <Divider />
            <ListItem
              testID="nav-support"
              icon={Heart}
              label="Support"
              sub="Support development of the app"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              accessibilityHint="Opens external support page"
              onPress={() => Linking.openURL("https://mxd.codes/support")}
            />
          </Card>
        </View>
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
  section: {
    marginBottom: 24
  }
})
