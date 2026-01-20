/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type ContainerProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  useKeyboardAvoid?: boolean;
};

export function Container({ children, style }: ContainerProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.container, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    marginBottom: 24,
  },
});
