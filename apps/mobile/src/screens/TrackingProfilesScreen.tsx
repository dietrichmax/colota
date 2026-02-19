/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, FlatList, Switch, Pressable } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { ProfileService } from "../services/ProfileService"
import { showAlert, showConfirm } from "../services/modalService"
import { SavedTrackingProfile, ScreenProps } from "../types/global"
import { fonts } from "../styles/typography"
import { Container, SectionTitle, Card } from "../components"
import { Plus, X, Zap } from "lucide-react-native"
import { logger } from "../utils/logger"
import { PROFILE_CONDITIONS, MS_TO_KMH } from "../constants"

function formatCondition(profile: SavedTrackingProfile): string {
  const condition = PROFILE_CONDITIONS.find((c) => c.type === profile.condition.type)
  const label = condition?.listLabel || profile.condition.type
  if (profile.condition.type === "speed_above" || profile.condition.type === "speed_below") {
    const kmh = ((profile.condition.speedThreshold ?? 0) * MS_TO_KMH).toFixed(0)
    return `${label} ${kmh} km/h`
  }
  return label
}

function formatSettings(profile: SavedTrackingProfile): string {
  const parts = [`${profile.interval}s interval`]
  if (profile.distance > 0) parts.push(`${profile.distance}m threshold`)
  parts.push(profile.syncInterval === 0 ? "instant sync" : `${profile.syncInterval}s sync`)
  return parts.join(" \u2022 ")
}

export function TrackingProfilesScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const { activeProfileName } = useTracking()
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

  const handleDelete = useCallback(
    async (item: SavedTrackingProfile) => {
      const confirmed = await showConfirm({
        title: "Delete Profile",
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
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate("Profile Editor", { profileId: item.id })}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + "15" }]}>
              <ConditionIcon size={18} color={colors.primary} />
            </View>

            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                {isActive && (
                  <View style={[styles.activeBadge, { backgroundColor: colors.success + "20" }]}>
                    <Text style={[styles.activeBadgeText, { color: colors.success }]}>Active</Text>
                  </View>
                )}
                <View style={[styles.priorityBadge, { backgroundColor: colors.border }]}>
                  <Text style={[styles.priorityText, { color: colors.textSecondary }]}>P{item.priority}</Text>
                </View>
              </View>
              <Text style={[styles.condition, { color: colors.textSecondary }]}>{formatCondition(item)}</Text>
              <Text style={[styles.settings, { color: colors.textLight }]}>{formatSettings(item)}</Text>
            </View>

            <View style={styles.actions}>
              <Switch
                testID={`toggle-profile-${item.id}`}
                value={item.enabled}
                onValueChange={(val) => toggleEnabled(item.id, val)}
                trackColor={{ false: colors.border, true: colors.primary + "80" }}
                thumbColor={item.enabled ? colors.primary : colors.border}
              />

              <Pressable
                testID={`delete-profile-${item.id}`}
                onPress={() => handleDelete(item)}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { backgroundColor: colors.error + "15" },
                  pressed && { opacity: 0.7 }
                ]}
              >
                <X size={16} color={colors.error} />
              </Pressable>
            </View>
          </Pressable>
        </Card>
      )
    },
    [colors, activeProfileName, toggleEnabled, handleDelete, navigation]
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
              <Text style={[styles.title, { color: colors.text }]}>Tracking Profiles</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Auto-switch GPS settings based on charging, Android Auto, or speed
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.createBtn,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.7 }
              ]}
              onPress={() => navigation.navigate("Profile Editor", {})}
            >
              <Plus size={20} color={colors.textOnPrimary} />
              <Text style={[styles.createBtnText, { color: colors.textOnPrimary }]}>Create Profile</Text>
            </Pressable>

            {profiles.length > 0 && <SectionTitle>Profiles ({profiles.length})</SectionTitle>}
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
  list: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, ...fonts.bold, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 14, ...fonts.regular, lineHeight: 20 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24
  },
  createBtnText: { fontSize: 15, ...fonts.semiBold },
  card: { marginBottom: 12, padding: 14 },
  activeCard: { borderWidth: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },
  info: { flex: 1, marginRight: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  name: { fontSize: 15, ...fonts.semiBold },
  activeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeBadgeText: { fontSize: 10, ...fonts.semiBold, textTransform: "uppercase" },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  priorityText: { fontSize: 10, ...fonts.semiBold },
  condition: { fontSize: 13, ...fonts.medium, marginBottom: 2 },
  settings: { fontSize: 11, ...fonts.regular },
  actions: { alignItems: "center", gap: 8 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 15, ...fonts.semiBold, marginBottom: 6 },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18
  }
})
