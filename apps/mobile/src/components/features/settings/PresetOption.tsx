/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet, Pressable } from "react-native"
import { Zap, Check } from "lucide-react-native"
import { SelectablePreset, TRACKING_PRESETS } from "../../../types/global"
import { fontSizes, fonts } from "../../../styles/typography"
import { useTheme } from "../../../hooks/useTheme"
import { RadioDot } from "../../ui/RadioDot"
import { size, space } from "../../../constants"

interface BadgeProps {
  icon: React.ReactElement
  label: string
  color: string
}

function Badge({ icon, label, color }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
      <View style={styles.badgeContent}>
        {icon}
        <Text style={[styles.badgeText, { color }]}>{label}</Text>
      </View>
    </View>
  )
}

interface PresetOptionProps {
  preset: SelectablePreset
  isSelected: boolean
  isOfflineMode: boolean
  onSelect: (preset: SelectablePreset) => void
}

export function PresetOption({ preset, isSelected, isOfflineMode, onSelect }: PresetOptionProps) {
  const { colors } = useTheme()
  const config = TRACKING_PRESETS[preset]
  const showRecommendedBadge = preset === "balanced"
  const showWarningBadge = config.batteryImpact === "High"

  return (
    <Pressable
      style={({ pressed }) => [pressed && { opacity: colors.pressedOpacity }]}
      onPress={() => onSelect(preset)}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
    >
      <View style={styles.content}>
        <View style={styles.leftContent}>
          <View style={styles.textContent}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.label,
                  isSelected ? { color: colors.primaryDark, ...fonts.bold } : { color: colors.text }
                ]}
              >
                {config.label}
              </Text>
              {showRecommendedBadge && (
                <Badge icon={<Check size={size.icon.sm} color={colors.success} />} label="Recommended" color={colors.success} />
              )}
              {showWarningBadge && (
                <Badge
                  icon={<Zap size={size.icon.sm} color={colors.warning} />}
                  label="High Battery Usage"
                  color={colors.warning}
                />
              )}
            </View>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {isOfflineMode ? config.description.split(" • ")[0] : config.description}
            </Text>
          </View>
        </View>

        <RadioDot selected={isSelected} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md
  },
  leftContent: {
    flex: 1
  },
  textContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.xs
  },
  label: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    letterSpacing: -0.2
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 6
  },
  badgeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs
  },
  badgeText: {
    fontSize: fontSizes.micro,
    ...fonts.bold,
    letterSpacing: 0.3
  },
  description: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    lineHeight: 18
  }
})
