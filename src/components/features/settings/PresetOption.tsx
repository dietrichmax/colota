/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  ThemeColors,
  SelectablePreset,
  TRACKING_PRESETS,
} from "../../../types/global";

interface PresetOptionProps {
  preset: SelectablePreset;
  isSelected: boolean;
  onSelect: (preset: SelectablePreset) => void;
  colors: ThemeColors;
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
export function PresetOption({
  preset,
  isSelected,
  onSelect,
  colors,
}: PresetOptionProps) {
  const config = TRACKING_PRESETS[preset];
  const showRecommendedBadge = preset === "balanced";
  const showWarningBadge = config.batteryImpact === "High";

  const radioBgColor = isSelected ? colors.primary + "20" : "transparent";

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isSelected
            ? colors.primary + "12"
            : colors.background,
        },
      ]}
      onPress={() => onSelect(preset)}
      activeOpacity={0.7}
    >
      {/* Selection indicator bar */}
      {isSelected && (
        <View
          style={[styles.selectionBar, { backgroundColor: colors.primary }]}
        />
      )}

      <View style={styles.content}>
        {/* Left side - Icon and text */}
        <View style={styles.leftContent}>
          <Text style={styles.emoji}>{config.emoji}</Text>
          <View style={styles.textContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.label, { color: colors.text }]}>
                {config.label}
              </Text>
              {showRecommendedBadge && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.success + "20",
                      borderColor: colors.success + "40",
                    },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: colors.success }]}>
                    ✓ Recommended
                  </Text>
                </View>
              )}
              {showWarningBadge && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.warning + "20",
                      borderColor: colors.warning + "40",
                    },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: colors.warning }]}>
                    ⚡ High Battery
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {config.description}
            </Text>
          </View>
        </View>

        {/* Right side - Radio button */}
        <View
          style={[
            styles.radio,
            {
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: radioBgColor,
            },
          ]}
        >
          {isSelected && (
            <View
              style={[styles.radioInner, { backgroundColor: colors.primary }]}
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    marginBottom: 8,
  },
  selectionBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingLeft: 20,
  },
  leftContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  emoji: {
    fontSize: 28,
  },
  textContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
