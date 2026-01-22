/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { View, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";

export const Divider = () => {
  const { colors } = useTheme();

  return <View style={[styles.divider, { backgroundColor: colors.divider }]} />;
};

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginVertical: 16,
  },
});
