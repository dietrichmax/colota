/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { StyleSheet, ScrollView } from "react-native"
import { ScreenProps, Settings } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTracking } from "../contexts/TrackingProvider"
import { FloatingSaveIndicator } from "../components/ui/FloatingSaveIndicator"
import { Container } from "../components"
import { ConnectionSettings } from "../components/features/settings/ConnectionSettings"

export function ConnectionScreen({ navigation }: ScreenProps) {
  const { settings, setSettings, restartTracking } = useTracking()
  const { colors } = useTheme()
  const { saving, saveSuccess, immediateSaveAndRestart } = useAutoSave()

  const [endpointInput, setEndpointInput] = useState(settings.endpoint || "")

  useEffect(() => {
    setEndpointInput(settings.endpoint || "")
  }, [settings.endpoint])

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
        <ConnectionSettings
          settings={settings}
          endpointInput={endpointInput}
          onEndpointInputChange={setEndpointInput}
          onSettingsChange={handleImmediateSave}
          colors={colors}
          navigation={navigation}
        />
      </ScrollView>

      <FloatingSaveIndicator saving={saving} success={saveSuccess} colors={colors} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16
  }
})
