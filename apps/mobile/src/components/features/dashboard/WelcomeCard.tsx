/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import { Check, ChevronRight } from "lucide-react-native"
import { Settings, ThemeColors } from "../../../types/global"
import { useTracking } from "../../../contexts/TrackingProvider"
import { fontSizes, fonts } from "../../../styles/typography"
import { Card } from "../../ui/Card"
import { size, space } from "../../../constants"
import { radius } from "@colota/shared"

interface WelcomeCardProps {
  settings: Settings
  tracking: boolean
  colors: ThemeColors
  onDismiss: () => void
  onStartTracking: () => void
  onNavigateToConnection: () => void
  onNavigateToTrackingSync: () => void
  onNavigateToApiConfig: () => void
}

interface ChecklistItemProps {
  label: string
  completed: boolean
  colors: ThemeColors
  onPress?: () => void
}

function ChecklistItem({ label, completed, colors, onPress }: ChecklistItemProps) {
  const content = (
    <View style={styles.checklistItem}>
      <View
        style={[
          styles.checkCircle,
          // eslint-disable-next-line react-native/no-inline-styles
          {
            borderColor: completed ? colors.success : colors.border,
            backgroundColor: completed ? colors.success + "20" : "transparent"
          }
        ]}
      >
        {completed && <Check size={size.icon.sm} color={colors.success} />}
      </View>
      <Text
        style={[
          styles.checklistLabel,
          { color: completed ? colors.textSecondary : colors.text },
          completed && styles.checklistLabelCompleted
        ]}
      >
        {label}
      </Text>
      {onPress && !completed && <ChevronRight size={size.icon.md} color={colors.textLight} />}
    </View>
  )

  if (onPress && !completed) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}>
        {content}
      </Pressable>
    )
  }

  return content
}

export function WelcomeCard({
  settings,
  tracking,
  colors,
  onDismiss,
  onStartTracking,
  onNavigateToConnection,
  onNavigateToTrackingSync,
  onNavigateToApiConfig
}: WelcomeCardProps) {
  const {
    settings: { isOfflineMode }
  } = useTracking()
  const hasEndpoint = settings.endpoint.trim().length > 0

  return (
    <View style={styles.container}>
      <Card variant="outlined" style={{ borderColor: colors.primary }}>
        <Text style={[styles.title, { color: colors.text }]}>Welcome to Colota</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Get started by completing these steps:</Text>

        <View style={styles.checklist}>
          <ChecklistItem label="1. Start tracking" completed={tracking} colors={colors} onPress={onStartTracking} />
          {!isOfflineMode && (
            <ChecklistItem
              label="2. Configure your server endpoint"
              completed={hasEndpoint}
              colors={colors}
              onPress={onNavigateToConnection}
            />
          )}
        </View>

        <View style={styles.linkRow}>
          {!isOfflineMode && (
            <Pressable
              onPress={onNavigateToApiConfig}
              style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
            >
              <Text style={[styles.link, { color: colors.primaryDark }]}>API field mapping</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onNavigateToTrackingSync}
            style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
          >
            <Text style={[styles.link, { color: colors.primaryDark }]}>Tracking presets</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.dismissButton,
            { borderColor: colors.border },
            pressed && { opacity: colors.pressedOpacity }
          ]}
          onPress={onDismiss}
        >
          <Text style={[styles.dismissText, { color: colors.textSecondary }]}>Got it</Text>
        </Pressable>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.lg
  },
  title: {
    fontSize: fontSizes.cardTitle,
    ...fonts.bold,
    marginBottom: space.xs
  },
  subtitle: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    marginBottom: space.lg
  },
  checklist: {
    gap: space.md,
    marginBottom: space.lg
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center"
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginEnd: space.md
  },
  checklistLabel: {
    fontSize: fontSizes.input,
    ...fonts.medium,
    flex: 1
  },
  checklistLabelCompleted: {
    textDecorationLine: "line-through"
  },
  linkRow: {
    flexDirection: "row",
    gap: space.lg,
    marginBottom: space.lg
  },
  link: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  dismissButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5
  },
  dismissText: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  }
})
