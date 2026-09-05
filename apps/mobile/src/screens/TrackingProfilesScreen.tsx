/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, FlatList, Pressable, Share } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { useTranslation } from "../i18n/useTranslation"
import { ProfileService } from "../services/ProfileService"
import { showAlert, showConfirm } from "../services/modalService"
import { SavedTrackingProfile, ScreenProps } from "../types/global"
import { text } from "../styles/typography"
import { Button, Container, EmptyState, ListItem, SectionTitle, Toggle } from "../components"
import { Plus, X, Zap } from "lucide-react-native"
import { logger } from "../utils/logger"
import { buildProfilesLink } from "../utils/setupLink"
import { size, space, PROFILE_CONDITIONS, MS_TO_KMH, STATE_LAYER_ALPHA } from "../constants"

type Translate = (key: string, options?: Record<string, unknown>) => string

const BULLET = " • "

function formatCondition(profile: SavedTrackingProfile, t: Translate): string {
  const condition = PROFILE_CONDITIONS.find((c) => c.type === profile.condition.type)
  const label = condition?.listLabel || profile.condition.type
  if (profile.condition.type === "speed_above" || profile.condition.type === "speed_below") {
    const kmh = ((profile.condition.speedThreshold ?? 0) * MS_TO_KMH).toFixed(0)
    return t("profiles.condition.speed", { label, kmh })
  }
  return label
}

function formatSettings(profile: SavedTrackingProfile, isOfflineMode: boolean | undefined, t: Translate): string {
  const parts = [t("profiles.part.interval", { seconds: profile.interval })]
  if (profile.distance > 0) parts.push(t("profiles.part.threshold", { meters: profile.distance }))
  if (!isOfflineMode) {
    parts.push(
      profile.syncInterval === 0
        ? t("profiles.part.instantSync")
        : t("profiles.part.sync", { seconds: profile.syncInterval })
    )
  }
  return parts.join(BULLET)
}

export function TrackingProfilesScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { settings, activeProfileName } = useTracking()
  const [profiles, setProfiles] = useState<SavedTrackingProfile[]>([])

  const loadProfiles = useCallback(async () => {
    try {
      const data = await ProfileService.getProfiles()
      setProfiles(data)
    } catch (err) {
      logger.error("[TrackingProfilesScreen] Failed to load profiles:", err)
    }
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  // Reload when returning from editor
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadProfiles()
    })
    return unsubscribe
  }, [navigation, loadProfiles])

  const toggleEnabled = useCallback(
    async (id: number, value: boolean) => {
      try {
        await ProfileService.updateProfile({ id, enabled: value })
        await loadProfiles()
      } catch {
        showAlert(t("profiles.error"), t("profiles.error.update"), "error")
      }
    },
    [loadProfiles, t]
  )

  const handleShareProfiles = useCallback(async () => {
    if (profiles.length === 0) return
    try {
      await Share.share({ message: buildProfilesLink(profiles) })
    } catch (err) {
      logger.error("[TrackingProfilesScreen] Failed to share profiles:", err)
      showAlert(t("profiles.error"), t("profiles.error.share"), "error")
    }
  }, [profiles, t])

  const handleDelete = useCallback(
    async (item: SavedTrackingProfile) => {
      const confirmed = await showConfirm({
        title: t("profiles.delete.title"),
        message: t("profiles.delete.message", { name: item.name }),
        confirmText: t("profiles.delete.confirm"),
        destructive: true
      })

      if (!confirmed) return

      try {
        await ProfileService.deleteProfile(item.id)
        await loadProfiles()
      } catch {
        showAlert(t("profiles.error"), t("profiles.error.delete"), "error")
      }
    },
    [loadProfiles, t]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: SavedTrackingProfile; index: number }) => {
      const condition = PROFILE_CONDITIONS.find((c) => c.type === item.condition.type)
      const ConditionIcon = condition?.icon || Zap
      const isActive = activeProfileName === item.name
      const details = formatCondition(item, t) + BULLET + formatSettings(item, settings.isOfflineMode, t)

      return (
        <ListItem
          icon={ConditionIcon}
          label={item.name}
          sub={
            isActive
              ? t("profiles.row.subActive", { priority: item.priority, details })
              : t("profiles.row.sub", { priority: item.priority, details })
          }
          divider={index < profiles.length - 1}
          style={isActive ? { backgroundColor: colors.primaryContainer } : undefined}
          onPress={() => navigation.navigate("Profile Editor", { profileId: item.id })}
          trailingIcon={null}
          trailing={
            <View style={styles.actions}>
              <Toggle
                testID={`toggle-profile-${item.id}`}
                value={item.enabled}
                onValueChange={(val) => toggleEnabled(item.id, val)}
                accessibilityLabel={t("profiles.enable", { name: item.name })}
              />
              <Pressable
                testID={`delete-profile-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={t("profiles.deleteAction", { name: item.name })}
                android_ripple={{ color: colors.error + STATE_LAYER_ALPHA, borderless: true, radius: 20 }}
                onPress={() => handleDelete(item)}
                style={styles.deleteButton}
              >
                <X size={size.icon.md} color={colors.error} />
              </Pressable>
            </View>
          }
        />
      )
    },
    [colors, activeProfileName, settings.isOfflineMode, profiles.length, toggleEnabled, handleDelete, navigation, t]
  )

  return (
    <Container>
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("profiles.intro")}</Text>

            <Button
              testID="create-profile-btn"
              title={t("profiles.create")}
              icon={Plus}
              onPress={() => navigation.navigate("Profile Editor", {})}
              style={styles.createButton}
            />

            {profiles.length > 0 && (
              <SectionTitle
                action={{
                  label: t("profiles.share"),
                  onPress: handleShareProfiles,
                  testID: "share-profiles-btn"
                }}
              >
                {t("profiles.count", { count: profiles.length })}
              </SectionTitle>
            )}
          </>
        }
        ListEmptyComponent={<EmptyState title={t("profiles.empty")} message={t("profiles.empty.message")} />}
        renderItem={renderItem}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  intro: {
    ...text.body
  },
  createButton: {
    marginTop: space.lg
  },
  actions: {
    flexDirection: "row",
    alignItems: "center"
  },
  deleteButton: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  }
})
