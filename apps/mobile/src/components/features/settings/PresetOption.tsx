/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import { View, Text, StyleSheet, Pressable } from "react-native"
import { Zap, Check } from "lucide-react-native"
import { SelectablePreset, TRACKING_PRESETS } from "../../../types/global"
import { fonts } from "../../../styles/typography"
import { useTheme } from "../../../hooks/useTheme"
import { useTracking } from "../../../contexts/TrackingProvider"
import { RadioDot } from "../../ui/RadioDot"

interface PresetOptionProps {
  preset: SelectablePreset
  isSelected: boolean
  onSelect: (preset: SelectablePreset) => void
}

export function PresetOption({ preset, isSelected, onSelect }: PresetOptionProps) {
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode
  const { colors } = useTheme()
  const config = TRACKING_PRESETS[preset]
  const showRecommendedBadge = preset === "balanced"
  const showWarningBadge = config.batteryImpact === "High"

  return (
    <Pressable
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
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
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.success + "20",
                      borderColor: colors.success + "40"
                    }
                  ]}
                >
                  <View style={styles.badgeContent}>
                    <Check size={10} color={colors.success} />
                    <Text style={[styles.badgeText, { color: colors.success }]}>Recommended</Text>
                  </View>
                </View>
              )}
              {showWarningBadge && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.warning + "20",
                      borderColor: colors.warning + "40"
                    }
                  ]}
                >
                  <View style={styles.badgeContent}>
                    <Zap size={10} color={colors.warning} />
                    <Text style={[styles.badgeText, { color: colors.warning }]}>High Battery Usage</Text>
                  </View>
                </View>
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
    padding: 12
  },
  leftContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  textContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4
  },
  label: {
    fontSize: 16,
    ...fonts.semiBold,
    letterSpacing: -0.2
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  badgeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  badgeText: {
    fontSize: 10,
    ...fonts.bold,
    letterSpacing: 0.3
  },
  description: {
    fontSize: 13,
    ...fonts.regular,
    lineHeight: 18
  }
})
