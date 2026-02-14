/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { Zap, Check } from "lucide-react-native"
import { ThemeColors, SelectablePreset, TRACKING_PRESETS } from "../../../types/global"
import { fonts } from "../../../styles/typography"

interface PresetOptionProps {
  preset: SelectablePreset
  isSelected: boolean
  onSelect: (preset: SelectablePreset) => void
  colors: ThemeColors
}

/**
 * PresetOption Component - Improved Design
 *
 * Enhanced with:
 * - Better visual hierarchy
 * - Cleaner badge placement
 * - Improved selection states
 * - More accessible touch targets
 */
export function PresetOption({ preset, isSelected, onSelect, colors }: PresetOptionProps) {
  const config = TRACKING_PRESETS[preset]
  const showRecommendedBadge = preset === "balanced"
  const showWarningBadge = config.batteryImpact === "High"

  const radioBgColor = isSelected ? colors.primary + "20" : "transparent"

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? colors.primary + "12" : colors.background
        }
      ]}
      onPress={() => onSelect(preset)}
      activeOpacity={0.7}
    >
      {/* Selection indicator bar */}
      {isSelected && <View style={[styles.selectionBar, { backgroundColor: colors.primary }]} />}

      <View style={styles.content}>
        {/* Left side - Icon and text */}
        <View style={styles.leftContent}>
          <View style={styles.textContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.label, { color: colors.text }]}>{config.label}</Text>
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
            <Text style={[styles.description, { color: colors.textSecondary }]}>{config.description}</Text>
          </View>
        </View>

        {/* Right side - Radio button */}
        <View
          style={[
            styles.radio,
            {
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: radioBgColor
            }
          ]}
        >
          {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    marginBottom: 8
  },
  selectionBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingLeft: 20
  },
  leftContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  iconContainer: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center"
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
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6
  }
})
