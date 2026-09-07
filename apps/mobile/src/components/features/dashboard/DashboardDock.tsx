/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { ScrollView, StyleSheet } from "react-native"
import { CircleAlert, CircleDashed, CircleDot, CirclePause, Timer, type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { Settings, ThemeColors } from "../../../types/global"
import { describeState, type StateIcon, type StateTone } from "../../../utils/dashboardState"
import { size, space } from "../../../constants"
import { Card } from "../../ui/Card"
import { Divider } from "../../ui/Divider"
import { SpinningLoader } from "../../ui/SpinningLoader"
import { StatRow } from "../../ui/StatRow"
import { ConnectionStatus } from "./ConnectionStatus"
import { StateLine } from "./StateLine"
import { WelcomeCard } from "./WelcomeCard"

type DashboardDockProps = {
  tracking: boolean
  hasFix: boolean
  locationEnabled: boolean
  activeZoneName: string | null
  pauseReason: string | null
  activeProfileName: string | null
  coords: { accuracy: number; timestamp: number } | null
  lastKnown: { timestamp: number } | null
  stoppedByBattery: boolean
  intervalText: string
  endpoint: string | null
  isOfflineMode: boolean
  navigation: any
  maxHeight: number
  firstRun: boolean
  settings: Settings
  colors: ThemeColors
  onDismiss: () => void
  onStartTracking: () => void
  onNavigateToConnection: () => void
  onNavigateToTrackingSync: () => void
  onNavigateToRequestFormat: () => void
}

const GLYPHS: Record<Exclude<StateIcon, "loader">, LucideIcon> = {
  dashed: CircleDashed,
  circleDot: CircleDot,
  pause: CirclePause,
  alert: CircleAlert
}

export function DashboardDock({
  tracking,
  hasFix,
  locationEnabled,
  activeZoneName,
  pauseReason,
  activeProfileName,
  coords,
  lastKnown,
  stoppedByBattery,
  intervalText,
  endpoint,
  isOfflineMode,
  navigation,
  maxHeight,
  firstRun,
  settings,
  colors: welcomeColors,
  onDismiss,
  onStartTracking,
  onNavigateToConnection,
  onNavigateToTrackingSync,
  onNavigateToRequestFormat
}: DashboardDockProps) {
  const { colors } = useTheme()

  if (firstRun) {
    return (
      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
        <WelcomeCard
          settings={settings}
          tracking={tracking}
          colors={welcomeColors}
          onDismiss={onDismiss}
          onStartTracking={onStartTracking}
          onNavigateToConnection={onNavigateToConnection}
          onNavigateToTrackingSync={onNavigateToTrackingSync}
          onNavigateToRequestFormat={onNavigateToRequestFormat}
        />
      </ScrollView>
    )
  }

  const state = describeState({
    tracking,
    hasFix,
    locationEnabled,
    activeZoneName,
    pauseReason,
    activeProfileName,
    coords,
    lastKnown,
    stoppedByBattery
  })
  const tones: Record<StateTone, string> = {
    secondary: colors.textSecondary,
    primary: colors.primary,
    success: colors.success,
    error: colors.error
  }
  const iconColor = tones[state.tone]
  const icon = state.icon === "loader" ? <SpinningLoader size={size.icon.md} color={iconColor} /> : GLYPHS[state.icon]

  return (
    <Card variant="elevated" rows>
      <ScrollView
        style={[styles.scroll, { maxHeight }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <StateLine icon={icon} iconColor={iconColor} label={state.label} caption={state.caption} testID="dock-state" />
        <Divider tight inset />
        <StatRow icon={Timer} label="Interval" value={intervalText} testID="dock-interval" />
        {!isOfflineMode && (
          <>
            <Divider tight inset />
            <ConnectionStatus endpoint={endpoint} navigation={navigation} />
          </>
        )}
      </ScrollView>
    </Card>
  )
}

const styles = StyleSheet.create({
  // The ScrollView clips, so it spans the card and insets its content or the server row's ripple stops at the padding.
  scroll: {
    marginHorizontal: -space.lg
  },
  scrollContent: {
    paddingHorizontal: space.lg
  }
})
