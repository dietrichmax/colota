/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback } from "react"
import { StyleSheet, ScrollView } from "react-native"
import { ScreenProps, Settings } from "../types/global"
import { useAutoSave } from "../hooks/useAutoSave"
import { useActiveProfile } from "../hooks/useActiveProfile"
import { useTracking } from "../contexts/TrackingProvider"
import { FloatingSaveIndicator } from "../components/ui/FloatingSaveIndicator"
import { Container } from "../components"
import { SyncStrategySettings } from "../components/features/settings/SyncStrategySettings"
import { space } from "../constants"

export function TrackingSyncScreen({}: ScreenProps) {
  const { settings, setSettings, updateSettingsLocal, restartTracking, activeProfileId } = useTracking()
  const activeProfile = useActiveProfile(activeProfileId)
  const {
    saving,
    message: saveMessage,
    isError: saveIsError,
    debouncedSaveAndRestart,
    immediateSaveAndRestart
  } = useAutoSave()

  const handleDebouncedSave = useCallback(
    (newSettings: Settings) => {
      debouncedSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [setSettings, debouncedSaveAndRestart, restartTracking]
  )

  const handleImmediateSave = useCallback(
    (newSettings: Settings) => {
      immediateSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [setSettings, immediateSaveAndRestart, restartTracking]
  )

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SyncStrategySettings
          settings={settings}
          onSettingsChange={updateSettingsLocal}
          onDebouncedSave={handleDebouncedSave}
          onImmediateSave={handleImmediateSave}
          activeProfile={activeProfile}
        />
      </ScrollView>

      <FloatingSaveIndicator saving={saving} message={saveMessage} isError={saveIsError} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  }
})
