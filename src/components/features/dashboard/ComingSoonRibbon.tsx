/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp, Text } from "react-native";
import { useTheme } from "../../../hooks/useTheme";

type ComingSoonRibbonProps = {
  style?: StyleProp<ViewStyle>;
};

export function ComingSoonRibbon({}: ComingSoonRibbonProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.comingSoonRibbon,
        { backgroundColor: colors.warning, shadowColor: colors.shadow },
      ]}
    >
      <Text style={styles.comingSoonRibbonText}>Coming Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  comingSoonRibbon: {
    position: "absolute",
    top: 8,
    right: -10, // push it a bit outside for the angled effect
    paddingVertical: 2,
    paddingHorizontal: 14,
    transform: [{ rotate: "45deg" }],
    zIndex: 10,
    elevation: 10, // Android shadow
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  comingSoonRibbonText: {
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
