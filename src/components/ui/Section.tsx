/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp, Text } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type SectionProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Section({ children, style }: SectionProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.section, style]}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    flex: 1,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 36,
  },
});
