/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import { Check, ChevronRight } from "lucide-react-native"
import { Settings, ThemeColors } from "../../../types/global"
import { useTracking } from "../../../contexts/TrackingProvider"
import { fontSizes, fonts, type } from "../../../styles/typography"
import { Button } from "../../ui/Button"
import { Card } from "../../ui/Card"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { radius } from "@colota/shared"

interface WelcomeCardProps {
  settings: Settings
  tracking: boolean
  colors: ThemeColors
  onDismiss: () => void
  onStartTracking: () => void
  onNavigateToConnection: () => void
  onNavigateToTrackingSync: () => void
  onNavigateToRequestFormat: () => void
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
      <View style={[styles.checkCircle, { borderColor: colors.border }]}>
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
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      >
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
  onNavigateToRequestFormat
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
              accessibilityRole="button"
              onPress={onNavigateToRequestFormat}
              android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
            >
              <Text style={[styles.link, { color: colors.primaryDark }]}>Request format</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onNavigateToTrackingSync}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
          >
            <Text style={[styles.link, { color: colors.primaryDark }]}>Tracking presets</Text>
          </Pressable>
        </View>

        <Button title="Got it" variant="secondary" onPress={onDismiss} />
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.lg
  },
  title: {
    ...type.title,
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
    borderRadius: radius.pill,
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
  }
})
