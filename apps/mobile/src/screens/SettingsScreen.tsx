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
import { useTranslation } from "../i18n/useTranslation"
import { SectionTitle, Container, ListItem, Notice } from "../components"
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
  Share2
} from "lucide-react-native"
import { logger } from "../utils/logger"
import { HIGH_QUEUE_THRESHOLD, space } from "../constants"

type Props = RootScreenProps<"Settings">

export function SettingsScreen({ navigation }: Props) {
  const { settings } = useTracking()
  const { t } = useTranslation()

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
    if (settings.isOfflineMode) return t("settings.connection.subOffline", { today: todayCount })

    let host = t("settings.connection.noServer")
    if (settings.endpoint) {
      try {
        host = new URL(settings.endpoint).host
      } catch {
        host = settings.endpoint
      }
    }
    return t("settings.connection.sub", {
      host,
      queued: queueCount,
      sent: sentCount,
      interval: settings.interval
    })
  }, [settings.isOfflineMode, settings.endpoint, settings.interval, queueCount, sentCount, todayCount, t])

  const syncSummary = useMemo(() => {
    const preset = settings.syncPreset
    const label =
      preset !== "custom" && TRACKING_PRESETS[preset] ? TRACKING_PRESETS[preset].label : t("settings.custom")
    return t("settings.trackingSync.sub", { preset: label, interval: settings.interval })
  }, [settings.syncPreset, settings.interval, t])

  const apiSummary = useMemo(() => {
    const template = settings.apiTemplate
    if (template === "custom") {
      const fieldCount = Object.values(settings.fieldMap).filter(Boolean).length + settings.customFields.length
      return t("settings.apiMapping.subCustom", { count: fieldCount })
    }
    return API_TEMPLATES[template]?.label ?? t("settings.custom")
  }, [settings.apiTemplate, settings.fieldMap, settings.customFields, t])

  const handleNavigateDataManagement = useCallback(() => {
    navigation.navigate("Data Management")
  }, [navigation])

  // The banner only earns the top of the screen once the queue is deep enough to act on;
  // below the threshold the count in the Connection sub line is the whole story.
  const showQueueNotice = !settings.isOfflineMode && queueCount >= HIGH_QUEUE_THRESHOLD

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showQueueNotice && (
          <View style={styles.notice}>
            <Notice
              testID="queue-notice"
              variant="warning"
              title={t("settings.queueNotice.title", { count: queueCount })}
              message={t("settings.queueNotice.message")}
              onPress={handleNavigateDataManagement}
            />
          </View>
        )}

        <ListItem
          testID="nav-connection"
          icon={Cloud}
          label={t("settings.connection")}
          sub={connectionSummary}
          divider
          onPress={() => navigation.navigate("Connection")}
        />
        <ListItem
          testID="nav-tracking-sync"
          icon={Navigation}
          label={t("settings.trackingSync")}
          sub={syncSummary}
          divider
          onPress={() => navigation.navigate("Tracking & Sync")}
        />
        {!settings.isOfflineMode && (
          <ListItem
            testID="nav-api-config"
            icon={Braces}
            label={t("settings.apiMapping")}
            sub={apiSummary}
            divider
            onPress={() => navigation.navigate("API Config")}
          />
        )}
        <ListItem
          testID="nav-tracking-profiles"
          icon={UserRoundPen}
          label={t("settings.trackingProfiles")}
          sub={t("settings.trackingProfiles.sub")}
          onPress={() => navigation.navigate("Tracking Profiles")}
        />

        <SectionTitle>{t("settings.display")}</SectionTitle>
        <ListItem
          testID="nav-appearance"
          icon={Palette}
          label={t("settings.appearance")}
          sub={t("settings.appearance.sub")}
          onPress={() => navigation.navigate("Appearance")}
        />

        <SectionTitle>{t("settings.data")}</SectionTitle>
        <ListItem
          testID="nav-data-management"
          icon={Database}
          label={t("settings.dataManagement")}
          sub={t("settings.dataManagement.sub")}
          divider
          onPress={handleNavigateDataManagement}
        />
        <ListItem
          testID="nav-import-locations"
          icon={Download}
          label={t("settings.importLocations")}
          sub={t("settings.importLocations.sub")}
          divider
          onPress={() => navigation.navigate("Import Locations")}
        />
        <ListItem
          testID="nav-export-locations"
          icon={Upload}
          label={t("settings.exportLocations")}
          sub={t("settings.exportLocations.sub")}
          divider
          onPress={() => navigation.navigate("Export Locations")}
        />
        <ListItem
          testID="nav-auto-export"
          icon={Clock}
          label={t("settings.autoExport")}
          sub={t("settings.autoExport.sub")}
          divider
          onPress={() => navigation.navigate("Auto-Export")}
        />
        <ListItem
          testID="nav-backup-restore"
          icon={ShieldCheck}
          label={t("settings.backupRestore")}
          sub={t("settings.backupRestore.sub")}
          divider
          onPress={() => navigation.navigate("Backup & Restore")}
        />
        <ListItem
          testID="nav-share-setup"
          icon={Share2}
          label={t("settings.shareSetup")}
          sub={t("settings.shareSetup.sub")}
          divider
          onPress={() => navigation.navigate("Share Setup")}
        />
        <ListItem
          testID="nav-offline-maps"
          icon={Map}
          label={t("settings.offlineMaps")}
          sub={t("settings.offlineMaps.sub")}
          divider
          onPress={() => navigation.navigate("Offline Maps")}
        />
        <ListItem
          testID="nav-logging"
          icon={ScrollText}
          label={t("settings.logging")}
          sub={t("settings.logging.sub")}
          onPress={() => navigation.navigate("Logging")}
        />

        <View style={styles.lastGroup}>
          <ListItem
            testID="nav-about"
            icon={Info}
            label={t("settings.about")}
            sub={t("settings.about.sub")}
            divider
            onPress={() => navigation.navigate("About Colota")}
          />
          <ListItem
            testID="nav-support"
            icon={Heart}
            label={t("settings.support")}
            sub={t("settings.support.sub")}
            trailingIcon={ExternalLink}
            accessibilityRole="link"
            accessibilityHint={t("settings.support.hint")}
            onPress={() => Linking.openURL("https://mxd.codes/support")}
          />
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
  notice: {
    marginBottom: space.lg
  },
  // The About group carries no heading, so the gap between groups is set here instead.
  lastGroup: {
    marginTop: space.xxl
  }
})
