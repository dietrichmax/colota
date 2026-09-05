/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, FlatList, Pressable, Share } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { ProfileService } from "../services/ProfileService"
import { showAlert, showConfirm } from "../services/modalService"
import { SavedTrackingProfile, ScreenProps } from "../types/global"
import { fontSizes, fonts } from "../styles/typography"
import { Button, Card, Container, SectionTitle, Toggle, IconButton } from "../components"
import { Plus, X, Zap, Share2 } from "lucide-react-native"
import { logger } from "../utils/logger"
import { buildProfilesLink } from "../utils/setupLink"
import { HIT_SLOP_MD, MS_TO_KMH, PROFILE_CONDITIONS, size, space } from "../constants"
import { radius } from "@colota/shared"

function formatCondition(profile: SavedTrackingProfile): string {
  const condition = PROFILE_CONDITIONS.find((c) => c.type === profile.condition.type)
  const label = condition?.listLabel || profile.condition.type
  if (profile.condition.type === "speed_above" || profile.condition.type === "speed_below") {
    const kmh = ((profile.condition.speedThreshold ?? 0) * MS_TO_KMH).toFixed(0)
    return `${label} ${kmh} km/h`
  }
  return label
}

function formatSettings(profile: SavedTrackingProfile, isOfflineMode?: boolean): string {
  const parts = [`${profile.interval}s interval`]
  if (profile.distance > 0) parts.push(`${profile.distance}m threshold`)
  if (!isOfflineMode) {
    parts.push(profile.syncInterval === 0 ? "instant sync" : `${profile.syncInterval}s sync`)
  }
  return parts.join(" \u2022 ")
}

export function TrackingProfilesScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
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
        showAlert("Error", "Failed to update profile.", "error")
      }
    },
    [loadProfiles]
  )

  const handleShareProfiles = useCallback(async () => {
    if (profiles.length === 0) return
    try {
      await Share.share({ message: buildProfilesLink(profiles) })
    } catch (err) {
      logger.error("[TrackingProfilesScreen] Failed to share profiles:", err)
      showAlert("Error", "Failed to share profiles.", "error")
    }
  }, [profiles])

  const handleDelete = useCallback(
    async (item: SavedTrackingProfile) => {
      const confirmed = await showConfirm({
        title: "Delete profile",
        message: `Delete "${item.name}"?`,
        confirmText: "Delete",
        destructive: true
      })

      if (!confirmed) return

      try {
        await ProfileService.deleteProfile(item.id)
        await loadProfiles()
      } catch {
        showAlert("Error", "Failed to delete profile.", "error")
      }
    },
    [loadProfiles]
  )

  const renderItem = useCallback(
    ({ item }: { item: SavedTrackingProfile }) => {
      const condition = PROFILE_CONDITIONS.find((c) => c.type === item.condition.type)
      const ConditionIcon = condition?.icon || Zap
      const isActive = activeProfileName === item.name

      return (
        <Card style={[styles.card, isActive && styles.activeCard, isActive && { borderColor: colors.primary }]}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: colors.pressedOpacity }]}
            onPress={() => navigation.navigate("Profile Editor", { profileId: item.id })}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + "15" }]}>
              <ConditionIcon size={size.icon.md} color={colors.primary} />
            </View>

            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                {isActive && (
                  <View style={[styles.activeBadge, { backgroundColor: colors.border }]}>
                    <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.activeBadgeText, { color: colors.textSecondary }]}>Active</Text>
                  </View>
                )}
                <View style={[styles.priorityBadge, { backgroundColor: colors.border }]}>
                  <Text style={[styles.priorityText, { color: colors.textSecondary }]}>P{item.priority}</Text>
                </View>
              </View>
              <Text style={[styles.condition, { color: colors.textSecondary }]}>{formatCondition(item)}</Text>
              <Text style={[styles.settings, { color: colors.textLight }]}>
                {formatSettings(item, settings.isOfflineMode)}
              </Text>
            </View>

            <View style={styles.actions}>
              <Toggle
                accessibilityLabel={`Enable ${item.name}`}
                testID={`toggle-profile-${item.id}`}
                value={item.enabled}
                onValueChange={(val) => toggleEnabled(item.id, val)}
              />

              <IconButton
                icon={X}
                tone="danger"
                testID={`delete-profile-${item.id}`}
                accessibilityLabel={`Delete ${item.name}`}
                onPress={() => handleDelete(item)}
              />
            </View>
          </Pressable>
        </Card>
      )
    },
    [colors, activeProfileName, settings.isOfflineMode, toggleEnabled, handleDelete, navigation]
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
            <View style={styles.header}>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Auto-switch GPS settings based on charging, Android Auto, or speed
              </Text>
            </View>

            <Button
              title="Create profile"
              icon={Plus}
              style={styles.createBtn}
              onPress={() => navigation.navigate("Profile Editor", {})}
            />

            {profiles.length > 0 && (
              <View style={styles.activeHeader}>
                <SectionTitle>Profiles ({profiles.length})</SectionTitle>
                <Pressable
                  testID="share-profiles-btn"
                  onPress={handleShareProfiles}
                  hitSlop={HIT_SLOP_MD}
                  style={({ pressed }) => [styles.shareBtn, pressed && { opacity: colors.pressedOpacity }]}
                >
                  <Share2 size={size.icon.md} color={colors.textSecondary} />
                </Pressable>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No profiles yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textLight }]}>
              Create a profile to automatically switch tracking settings when charging, connected to Android Auto, or
              based on speed
            </Text>
          </View>
        }
        renderItem={renderItem}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: 40 },
  header: { marginBottom: 20 },
  subtitle: { fontSize: fontSizes.body, ...fonts.regular, lineHeight: 20 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    marginBottom: space.xl
  },
  card: { marginBottom: space.md },
  activeCard: { borderWidth: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: space.md
  },
  info: { flex: 1, marginEnd: space.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 2 },
  name: { fontSize: fontSizes.input, ...fonts.semiBold },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs
  },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeBadgeText: { fontSize: fontSizes.micro, ...fonts.semiBold },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs },
  priorityText: { fontSize: fontSizes.micro, ...fonts.semiBold },
  condition: { fontSize: fontSizes.description, ...fonts.medium, marginBottom: 2 },
  settings: { fontSize: fontSizes.small, ...fonts.regular },
  actions: { alignItems: "center", gap: space.sm },
  activeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shareBtn: { padding: space.xs, marginBottom: space.md },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: fontSizes.input, ...fonts.semiBold, marginBottom: 6 },
  emptyHint: {
    fontSize: fontSizes.description,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18
  }
})
