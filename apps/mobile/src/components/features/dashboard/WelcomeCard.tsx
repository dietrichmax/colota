/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import { Check, ChevronRight } from "lucide-react-native"
import { Settings, ThemeColors } from "../../../types/global"
import { fonts } from "../../../styles/typography"
import { Card } from "../../ui/Card"

interface WelcomeCardProps {
  settings: Settings
  tracking: boolean
  colors: ThemeColors
  onDismiss: () => void
  onStartTracking: () => void
  onNavigateToSettings: () => void
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
        {completed && <Check size={13} color={colors.success} />}
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
      {onPress && !completed && <ChevronRight size={18} color={colors.textLight} />}
    </View>
  )

  if (onPress && !completed) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
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
  onNavigateToSettings,
  onNavigateToApiConfig
}: WelcomeCardProps) {
  const hasEndpoint = settings.endpoint.trim().length > 0

  return (
    <View style={styles.container}>
      <Card variant="outlined" style={{ borderColor: colors.primary }}>
        <Text style={[styles.title, { color: colors.text }]}>Welcome to Colota</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Get started by completing these steps:</Text>

        <View style={styles.checklist}>
          <ChecklistItem label="1. Start tracking" completed={tracking} colors={colors} onPress={onStartTracking} />
          <ChecklistItem
            label="2. Configure your server endpoint"
            completed={hasEndpoint}
            colors={colors}
            onPress={onNavigateToSettings}
          />
        </View>

        <View style={styles.linkRow}>
          <Pressable onPress={onNavigateToApiConfig} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[styles.link, { color: colors.primaryDark }]}>API field mapping</Text>
          </Pressable>
          <Pressable onPress={onNavigateToSettings} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[styles.link, { color: colors.primaryDark }]}>Tracking presets</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.dismissButton, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
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
    marginBottom: 16
  },
  title: {
    fontSize: 20,
    ...fonts.bold,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    ...fonts.regular,
    marginBottom: 16
  },
  checklist: {
    gap: 12,
    marginBottom: 16
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center"
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  checklistLabel: {
    fontSize: 15,
    ...fonts.medium,
    flex: 1
  },
  checklistLabelCompleted: {
    textDecorationLine: "line-through"
  },
  linkRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16
  },
  link: {
    fontSize: 14,
    ...fonts.semiBold
  },
  dismissButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5
  },
  dismissText: {
    fontSize: 14,
    ...fonts.semiBold
  }
})
