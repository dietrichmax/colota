/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { Zap, Check } from "lucide-react-native"
import { radius } from "@colota/shared"
import { SelectablePreset, TRACKING_PRESETS } from "../../../types/global"
import { text } from "../../../styles/typography"
import { size, space } from "../../../constants"
import { useTheme } from "../../../hooks/useTheme"
import { RadioRow } from "../../ui/RadioRow"

interface BadgeProps {
  icon: React.ReactElement
  label: string
  color: string
}

function Badge({ icon, label, color }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "20" }]}>
      {icon}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
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
  const description = isOfflineMode ? config.description.split(" • ")[0] : config.description
  const badges = [showRecommendedBadge && "Recommended", showWarningBadge && "High Battery Usage"].filter(Boolean)

  return (
    <RadioRow
      label={config.label}
      caption={description}
      selected={isSelected}
      onPress={() => onSelect(preset)}
      accessibilityLabel={[config.label, ...badges, description].join(", ")}
      accessory={
        <>
          {showRecommendedBadge && (
            <Badge
              icon={<Check size={size.icon.sm} color={colors.success} />}
              label="Recommended"
              color={colors.success}
            />
          )}
          {showWarningBadge && (
            <Badge
              icon={<Zap size={size.icon.sm} color={colors.warning} />}
              label="High Battery Usage"
              color={colors.warning}
            />
          )}
        </>
      }
    />
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.xs
  },
  badgeText: {
    ...text.caption
  }
})
