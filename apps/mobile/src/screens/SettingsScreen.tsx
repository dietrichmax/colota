/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { StyleSheet, View, ScrollView, Linking, DeviceEventEmitter } from "react-native"
import type { RootScreenProps } from "../types/navigation"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { useTheme } from "../hooks/useTheme"
import { showAlert } from "../services/modalService"
import { SectionTitle, Card, Container, Divider, ListItem } from "../components"
import {
  Archive,
  Clock,
  Cloud,
  Database,
  Download,
  ExternalLink,
  Heart,
  Info,
  Map,
  MessageCircle,
  Navigation,
  Palette,
  Scale,
  ScrollText,
  Sparkles,
  Share2,
  Star,
  Upload,
  UserRoundPen
} from "lucide-react-native"
import { getTimeFormat, getUnitSystem } from "../utils/geo"
import { t } from "../i18n"
import { trackingSummary } from "../utils/dashboardState"
import { describeServer } from "../utils/serverState"
import { profileStateLabel } from "../utils/profileRow"
import {
  autoExportRowSub,
  dataRowSub,
  exportFormatsSub,
  getVariantLabel,
  importFormatsSub,
  loggingRowSub,
  offlineMapsRowSub
} from "../utils/settingsRow"
import { ProfileService } from "../services/ProfileService"
import { loadOfflineAreas, type OfflineAreaInfo } from "../components/features/map/OfflinePackManager"
import { logger } from "../utils/logger"
import { space, RELEASES_URL, ISSUES_URL, SUPPORT_URL, PLAY_STORE_MARKET_URL, PLAY_STORE_WEB_URL } from "../constants"

type Props = RootScreenProps<"Settings">

type AutoExportStatus = Awaited<ReturnType<typeof NativeLocationService.getAutoExportStatus>>

export function SettingsScreen({ navigation }: Props) {
  const { settings, activeProfileName, tracking } = useTracking()
  const { colors, preference } = useTheme()

  const [totalCount, setTotalCount] = useState(0)
  const [databaseSizeMB, setDatabaseSizeMB] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [lastSyncError, setLastSyncError] = useState("")
  const [deviceOnline, setDeviceOnline] = useState(true)
  const [profileCount, setProfileCount] = useState(0)
  const [autoExport, setAutoExport] = useState<AutoExportStatus | null>(null)
  const [fileLogging, setFileLogging] = useState({ enabled: false, bytes: 0 })
  const [offlineAreas, setOfflineAreas] = useState<OfflineAreaInfo[]>([])
  const [, setFocusTick] = useState(0)

  /** The two cheap reads behind the Connection sub; every sync event re-runs these alone. */
  const readSyncState = useCallback(async () => {
    const [stats, online] = await Promise.allSettled([
      NativeLocationService.getStats(),
      NativeLocationService.isNetworkAvailable()
    ])
    if (stats.status === "fulfilled") {
      setTotalCount(stats.value.total)
      setDatabaseSizeMB(stats.value.databaseSizeMB)
      setQueueCount(stats.value.queued)
      setTodayCount(stats.value.today)
      setLastSyncTime(stats.value.lastSyncTime ?? 0)
      setLastSyncError(stats.value.lastSyncError ?? "")
    } else {
      logger.error("[SettingsScreen] Failed to get stats:", stats.reason)
    }
    if (online.status === "fulfilled") setDeviceOnline(online.value)
  }, [])

  const readAutoExport = useCallback(async () => {
    try {
      setAutoExport(await NativeLocationService.getAutoExportStatus())
    } catch (err) {
      logger.error("[SettingsScreen] Failed to read the auto-export status:", err)
    }
  }, [])

  /** Every sub keeps its last value when its own read rejects, so one slow pack walk never blanks the card. */
  const readAll = useCallback(async () => {
    // One batch: the MapLibre pack walk must not wait behind the two sync reads on every focus.
    const [, profiles, exportStatus, logEnabled, logBytes, areas] = await Promise.allSettled([
      readSyncState(),
      ProfileService.getProfiles(),
      NativeLocationService.getAutoExportStatus(),
      NativeLocationService.getSetting("debugFileLoggingEnabled", "false"),
      NativeLocationService.getFileLogSize(),
      loadOfflineAreas()
    ])
    if (profiles.status === "fulfilled") setProfileCount(profiles.value.length)
    if (exportStatus.status === "fulfilled") setAutoExport(exportStatus.value)
    setFileLogging((prev) => ({
      enabled: logEnabled.status === "fulfilled" ? logEnabled.value === "true" : prev.enabled,
      bytes: logBytes.status === "fulfilled" ? logBytes.value : prev.bytes
    }))
    if (areas.status === "fulfilled") setOfflineAreas(areas.value)
    // A focus read may change nothing the state above holds, and the Appearance sub reads a module
    // cache rather than state, so it needs a render to pick a change up.
    setFocusTick((tick) => tick + 1)
  }, [readSyncState])

  useFocusEffect(
    useCallback(() => {
      readAll()
      const subs = [
        DeviceEventEmitter.addListener("onLocationUpdate", readSyncState),
        DeviceEventEmitter.addListener("onSyncProgress", readSyncState),
        DeviceEventEmitter.addListener("onSyncError", readSyncState),
        DeviceEventEmitter.addListener("onAutoExportComplete", readAutoExport)
      ]
      return () => subs.forEach((s) => s.remove())
    }, [readAll, readSyncState, readAutoExport])
  )

  useEffect(() => {
    readSyncState()
  }, [settings.isOfflineMode, settings.endpoint, readSyncState])

  const server = useMemo(
    () =>
      describeServer({
        offline: settings.isOfflineMode,
        endpoint: settings.endpoint,
        deviceOnline,
        queued: queueCount,
        today: todayCount,
        lastSyncTime,
        lastSyncError
      }),
    [settings.isOfflineMode, settings.endpoint, deviceOnline, queueCount, todayCount, lastSyncTime, lastSyncError]
  )

  const syncSummary = useMemo(
    () => trackingSummary(settings.interval, settings.distance, settings.syncInterval, settings.isOfflineMode),
    [settings.interval, settings.distance, settings.syncInterval, settings.isOfflineMode]
  )

  // Both getters read a module cache the Appearance screen refreshes on save, so this costs no
  // bridge call and is not worth a memo: memoising on `preference` alone would keep the units and
  // the time format from the render before the change for the rest of the session.
  const appearanceSummary = `${t(`appearance.theme.${preference}`)} · ${t(`appearance.units.${getUnitSystem()}`)} · ${getTimeFormat()}`

  const profileSummary = profileCount === 0 ? "No profiles yet" : profileStateLabel(activeProfileName, tracking)
  const inForce = profileCount > 0 && tracking && !!activeProfileName
  const serverTint = server.tone === "error" ? colors.error : server.tone === "warning" ? colors.warning : undefined

  const openLink = useCallback(async (url: string, fallback?: string) => {
    try {
      await Linking.openURL(url)
    } catch (err) {
      if (fallback) {
        openLink(fallback)
        return
      }
      logger.error("[SettingsScreen] Failed to open a link:", err)
      showAlert("Error", "Could not open the link.", "error")
    }
  }, [])

  const isPlayBuild = NativeLocationService.getBuildConfig()?.FLAVOR === "gms"

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionTitle>Tracking</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-connection"
              icon={Cloud}
              iconColor={serverTint}
              label="Connection"
              sub={server.rowSub}
              subLines={2}
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
            <Divider tight inset />
            <ListItem
              testID="nav-tracking-profiles"
              icon={UserRoundPen}
              iconColor={inForce ? colors.success : undefined}
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
            <Divider tight inset />
            <ListItem
              testID="nav-offline-maps"
              icon={Map}
              label="Offline maps"
              sub={offlineMapsRowSub(offlineAreas)}
              onPress={() => navigation.navigate("Offline Maps")}
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
              sub={dataRowSub(totalCount, databaseSizeMB)}
              onPress={() => navigation.navigate("Data Management")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-import-locations"
              icon={Download}
              label="Import locations"
              sub={importFormatsSub()}
              onPress={() => navigation.navigate("Import Locations")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-export-locations"
              icon={Upload}
              label="Export locations"
              sub={exportFormatsSub()}
              onPress={() => navigation.navigate("Export Locations")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-auto-export"
              icon={Clock}
              label="Auto-export"
              sub={autoExportRowSub(autoExport)}
              onPress={() => navigation.navigate("Auto-Export")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-backup-restore"
              icon={Archive}
              label="Backup & restore"
              sub="Locations, settings and credentials"
              onPress={() => navigation.navigate("Backup & Restore")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-share-setup"
              icon={Share2}
              label="Share setup"
              sub="Settings, geofences and profiles as a link"
              onPress={() => navigation.navigate("Share Setup")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Help</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-logging"
              icon={ScrollText}
              label="Logging"
              sub={loggingRowSub(fileLogging.enabled, fileLogging.bytes)}
              onPress={() => navigation.navigate("Logging")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-feedback"
              icon={MessageCircle}
              label="Feedback & help"
              sub="github.com/dietrichmax/colota/issues"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openLink(ISSUES_URL)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-whats-new"
              icon={Sparkles}
              label="What's new"
              sub="colota.app/releases"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openLink(RELEASES_URL)}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>About</SectionTitle>
          <Card rows>
            {isPlayBuild && (
              <>
                <ListItem
                  testID="nav-rate"
                  icon={Star}
                  label="Rate the app"
                  sub="Google Play"
                  trailingIcon={ExternalLink}
                  accessibilityRole="link"
                  accessibilityHint="Opens Colota in Google Play"
                  onPress={() => openLink(PLAY_STORE_MARKET_URL, PLAY_STORE_WEB_URL)}
                />
                <Divider tight inset />
              </>
            )}
            <ListItem
              testID="nav-support"
              icon={Heart}
              label="Say thanks"
              sub="mxd.codes/support"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openLink(SUPPORT_URL)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-legal"
              icon={Scale}
              label="Legal"
              sub="Privacy policy, license, map data"
              onPress={() => navigation.navigate("Legal")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-about"
              icon={Info}
              label="About"
              sub={`Version ${NativeLocationService.getBuildConfig()?.VERSION_NAME ?? ""} · ${getVariantLabel(
                NativeLocationService.getBuildConfig()?.FLAVOR ?? ""
              )}`}
              onPress={() => navigation.navigate("About Colota")}
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
    paddingBottom: space.xxl
  },
  section: {
    marginBottom: space.xl
  }
})
