/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { StyleSheet, View, ScrollView, Linking, DeviceEventEmitter } from "react-native"
import { API_TEMPLATES } from "../types/global"
import type { RootScreenProps } from "../types/navigation"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { useTheme } from "../hooks/useTheme"
import { SectionTitle, Card, Container, Divider, QueueWarning, ListItem } from "../components"
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
  Share2,
  Sparkles,
  MessageCircle,
  Star
} from "lucide-react-native"
import { formatDuration, getTimeFormat, getUnitSystem } from "../utils/geo"
import { formatCount } from "../utils/format"
import { ProfileService } from "../services/ProfileService"
import { logger } from "../utils/logger"
import { space, RELEASES_URL, ISSUES_URL, PLAY_STORE_MARKET_URL, PLAY_STORE_WEB_URL } from "../constants"

type Props = RootScreenProps<"Settings">

export function SettingsScreen({ navigation }: Props) {
  const { settings, activeProfileName } = useTracking()
  const { preference } = useTheme()

  const [queueCount, setQueueCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [databaseSizeMB, setDatabaseSizeMB] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [profileCount, setProfileCount] = useState(0)

  const updateStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats()
      setQueueCount(stats.queued)
      setTotalCount(stats.total)
      setDatabaseSizeMB(stats.databaseSizeMB)
      setTodayCount(stats.today)
    } catch (err) {
      logger.error("[SettingsScreen] Failed to get stats:", err)
    }
    try {
      setProfileCount((await ProfileService.getProfiles()).length)
    } catch (err) {
      logger.error("[SettingsScreen] Failed to count profiles:", err)
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

  // The row carries the numbers the stats strip used to, so the strip could go. One line, so a
  // segment only appears when it has something to say.
  const connectionSummary = useMemo(() => {
    if (settings.isOfflineMode) return `Offline - saved locally · ${todayCount.toLocaleString()} today`
    if (!settings.endpoint) return "No server configured"
    let host = settings.endpoint
    try {
      host = new URL(settings.endpoint).host
    } catch {
      host = settings.endpoint
    }
    return queueCount > 0 ? `${host} · ${formatCount(queueCount)} queued` : host
  }, [settings.isOfflineMode, settings.endpoint, queueCount, todayCount])

  // The row names both, so it shows both: interval is the GPS cadence and syncInterval the upload
  // one. The preset label stood in for numbers the row now carries.
  const syncSummary = useMemo(() => {
    const sync = settings.syncInterval <= 0 ? "syncs instantly" : `syncs every ${formatDuration(settings.syncInterval)}`
    return `Every ${settings.interval}s · ${sync}`
  }, [settings.interval, settings.syncInterval])

  // Both getters read a module cache the Appearance screen refreshes on save, so this costs no
  // bridge call; the screen re-reads on focus, which is when a change can have happened.
  const appearanceSummary = useMemo(() => {
    const theme = preference.charAt(0).toUpperCase() + preference.slice(1)
    const units = getUnitSystem() === "imperial" ? "Imperial" : "Metric"
    return `${theme} · ${units} · ${getTimeFormat()}`
  }, [preference])

  // Nothing recorded yet is not state worth reporting, and it is the first thing a new install
  // shows under this heading.
  const dataSummary = useMemo(() => {
    if (totalCount === 0) return "View queue and clear data"
    return `${formatCount(totalCount)} recorded · ${databaseSizeMB.toFixed(1)} MB`
  }, [totalCount, databaseSizeMB])

  // Which profile is overriding the tracking settings, not how many exist: a count is inventory
  // and tells a user with profiles nothing they do not know.
  const profileSummary = useMemo(() => {
    if (profileCount === 0) return "Switch GPS settings by condition"
    return activeProfileName ? `${activeProfileName} active` : "No profile active"
  }, [profileCount, activeProfileName])

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
        <QueueWarning queueCount={queueCount} onPress={handleNavigateDataManagement} />

        <View style={styles.section}>
          <SectionTitle>Tracking</SectionTitle>
          <Card rows>
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
                  label="Request format"
                  sub={apiSummary}
                  onPress={() => navigation.navigate("Request Format")}
                />
              </>
            )}
            <Divider tight inset />
            <ListItem
              testID="nav-tracking-profiles"
              icon={UserRoundPen}
              label="Tracking profiles"
              sub={profileSummary}
              onPress={() => navigation.navigate("Tracking Profiles")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Display</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-appearance"
              icon={Palette}
              label="Appearance"
              sub={appearanceSummary}
              onPress={() => navigation.navigate("Appearance")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Data</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-data-management"
              icon={Database}
              label="Data management"
              sub={dataSummary}
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
          <Card rows>
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
              label="Say thanks"
              sub="Free, one click, or a donation"
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
