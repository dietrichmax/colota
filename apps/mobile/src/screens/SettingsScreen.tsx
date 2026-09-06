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
  Upload,
  Map,
  ScrollText,
  ShieldCheck,
  Info,
  Heart,
  Clock,
  Share2, Sparkles, MessageCircle, Star } from "lucide-react-native"
import { logger } from "../utils/logger"
import { space, RELEASES_URL, ISSUES_URL, PLAY_STORE_MARKET_URL, PLAY_STORE_WEB_URL } from "../constants"

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

  const handleRateApp = useCallback(async () => {
    // The Play app resolves market:// straight to the listing; a device without it falls back.
    try {
      await Linking.openURL(PLAY_STORE_MARKET_URL)
    } catch {
      Linking.openURL(PLAY_STORE_WEB_URL)
    }
  }, [])

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
          <SectionTitle>Tracking</SectionTitle>
          <Card flush>
            <ListItem
              testID="nav-connection"
              icon={Cloud}
              label="Connection"
              sub={connectionSummary}
              onPress={() => navigation.navigate("Connection")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-tracking-sync"
              icon={Navigation}
              label="Tracking & sync"
              sub={syncSummary}
              onPress={() => navigation.navigate("Tracking & Sync")}
            />
            {!settings.isOfflineMode && (
              <>
                <Divider tight inset />
                <ListItem
                  testID="nav-api-config"
                  icon={Braces}
                  label="API Field Mapping"
                  sub={apiSummary}
                  onPress={() => navigation.navigate("API Config")}
                />
              </>
            )}
            <Divider tight inset />
            <ListItem
              testID="nav-tracking-profiles"
              icon={UserRoundPen}
              label="Tracking profiles"
              sub="Auto-switch GPS settings based on conditions"
              onPress={() => navigation.navigate("Tracking Profiles")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Display</SectionTitle>
          <Card flush>
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
          <Card flush>
            <ListItem
              testID="nav-data-management"
              icon={Database}
              label="Data management"
              sub="View queue and clear data"
              onPress={() => navigation.navigate("Data Management")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-import-locations"
              icon={Download}
              label="Import locations"
              sub="Merge locations from a GeoJSON or Google Timeline file"
              onPress={() => navigation.navigate("Import Locations")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-export-locations"
              icon={Upload}
              label="Export locations"
              sub="Export locations as CSV, GeoJSON, GPX or KML"
              onPress={() => navigation.navigate("Export Locations")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-auto-export"
              icon={Clock}
              label="Auto-Export"
              sub="Schedule daily, weekly or monthly exports"
              onPress={() => navigation.navigate("Auto-Export")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-backup-restore"
              icon={ShieldCheck}
              label="Backup & restore"
              sub="Encrypted backup of all your data"
              onPress={() => navigation.navigate("Backup & Restore")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-share-setup"
              icon={Share2}
              label="Share setup"
              sub="Share your settings, geofences and profiles as a link"
              onPress={() => navigation.navigate("Share Setup")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-offline-maps"
              icon={Map}
              label="Offline maps"
              sub="Download map tiles for use without internet"
              onPress={() => navigation.navigate("Offline Maps")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-logging"
              icon={ScrollText}
              label="Logging"
              sub="View activity log and configure file logging"
              onPress={() => navigation.navigate("Logging")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Colota</SectionTitle>
          <Card flush>
            <ListItem
              testID="nav-whats-new"
              icon={Sparkles}
              label="What's new"
              sub="Release notes for every version"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => Linking.openURL(RELEASES_URL)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-feedback"
              icon={MessageCircle}
              label="Feedback & help"
              sub="Report a bug or ask a question"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => Linking.openURL(ISSUES_URL)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-rate"
              icon={Star}
              label="Rate the app"
              sub="Leave a review on Google Play"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={handleRateApp}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-legal"
              icon={ScrollText}
              label="Legal"
              sub="Privacy policy, license and attribution"
              onPress={() => navigation.navigate("Legal")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-about"
              icon={Info}
              label="About"
              sub="Version and build details"
              onPress={() => navigation.navigate("About Colota")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-support"
              icon={Heart}
              label="Support development"
              sub="Help keep the app free and open"
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
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg
  },
  section: {
    marginBottom: space.xl
  }
})
