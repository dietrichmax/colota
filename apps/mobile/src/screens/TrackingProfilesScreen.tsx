/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useLayoutEffect } from "react"
import { View, Text, StyleSheet, ScrollView, Share } from "react-native"
import { Plus, Share2, UserRoundPen } from "lucide-react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { useActiveProfile } from "../hooks/useActiveProfile"
import { ProfileService } from "../services/ProfileService"
import { showAlert } from "../services/modalService"
import { SavedTrackingProfile, ScreenProps } from "../types/global"
import { fontSizes, fonts, lineHeights } from "../styles/typography"
import { Card, Container, Divider, EmptyState, HeaderAction, ListItem, StateLine, Toggle } from "../components"
import { logger } from "../utils/logger"
import { buildProfilesLink } from "../utils/setupLink"
import { conditionOf, describeProfileState, profileRowSub } from "../utils/profileRow"
import { space } from "../constants"
import { useTranslation } from "../i18n/useTranslation"

export function TrackingProfilesScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { settings, activeProfileId, tracking } = useTracking()
  const activeProfile = useActiveProfile(activeProfileId)
  const [profiles, setProfiles] = useState<SavedTrackingProfile[]>([])

  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await ProfileService.getProfiles())
    } catch (err) {
      logger.error("[TrackingProfilesScreen] Failed to load profiles:", err)
    }
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  useEffect(() => navigation.addListener("focus", loadProfiles), [navigation, loadProfiles])

  const toggleEnabled = useCallback(
    async (id: number, enabled: boolean) => {
      try {
        await ProfileService.updateProfile({ id, enabled })
        await loadProfiles()
      } catch {
        showAlert(t("common.error"), t("profiles.updateFailed"), "error")
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
      showAlert(t("common.error"), t("profiles.shareFailed"), "error")
    }
  }, [profiles, t])

  const openEditor = useCallback(
    (profileId?: number) => navigation.navigate("Profile Editor", profileId === undefined ? {} : { profileId }),
    [navigation]
  )

  const hasProfiles = profiles.length > 0
  const renderHeaderActions = useCallback(
    () => (
      <View style={styles.headerRow}>
        {hasProfiles && (
          <HeaderAction
            icon={Share2}
            label={t("profiles.share")}
            onPress={handleShareProfiles}
            testID="share-profiles-btn"
          />
        )}
        <HeaderAction
          icon={Plus}
          label={t("profileEditor.create")}
          onPress={() => openEditor()}
          testID="add-profile-btn"
        />
      </View>
    ),
    [hasProfiles, handleShareProfiles, openEditor, t]
  )
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: renderHeaderActions })
  }, [navigation, renderHeaderActions])

  const state = describeProfileState(activeProfile, settings, tracking)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {hasProfiles ? (
          <>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("profiles.intro")}</Text>
            <Card rows>
              <StateLine
                icon={state.icon}
                iconColor={state.tone === "success" ? colors.success : colors.textSecondary}
                label={state.label}
                caption={state.caption}
                testID="profile-state"
              />
              <Divider tight />
              {profiles.map((profile, i) => {
                const inForce = tracking && profile.id === activeProfileId
                return (
                  <React.Fragment key={profile.id}>
                    {i > 0 && <Divider tight inset />}
                    <ListItem
                      testID={`profile-${profile.id}`}
                      icon={conditionOf(profile).icon}
                      iconColor={inForce ? colors.success : undefined}
                      label={profile.name}
                      sub={profileRowSub(profile, inForce, settings.isOfflineMode)}
                      subLines={2}
                      onPress={() => openEditor(profile.id)}
                      trailing={
                        <Toggle
                          accessibilityLabel={t("profiles.use", { name: profile.name })}
                          testID={`profile-toggle-${profile.id}`}
                          value={profile.enabled}
                          onValueChange={(enabled) => toggleEnabled(profile.id, enabled)}
                        />
                      }
                    />
                  </React.Fragment>
                )
              })}
            </Card>
          </>
        ) : (
          <EmptyState
            icon={UserRoundPen}
            title={t("profiles.empty.title")}
            hint={t("profiles.empty.hint")}
            action={{ label: t("profileEditor.create"), onPress: () => openEditor() }}
            style={styles.empty}
          />
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row"
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  empty: {
    paddingHorizontal: 0
  }
})
