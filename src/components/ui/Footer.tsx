/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";

export function Footer() {
  const { colors } = useTheme();

  return (
    <View style={styles.footer}>
      <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
        🔒 All data stays on your device and server
      </Text>
      <Text style={[styles.taglineText, { color: colors.textLight }]}>
        Open source · Self-hosted · Privacy-first
      </Text>
      <View style={styles.divider} />
      <Text style={[styles.copyright, { color: colors.textLight }]}>
        © 2026 Max Dietrich
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: 32,
    marginBottom: 16,
    alignItems: "center",
    gap: 8,
  },
  privacyText: {
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
  },
  taglineText: {
    fontSize: 12,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: "#666",
    opacity: 0.3,
    marginVertical: 4,
  },
  copyright: {
    fontSize: 11,
    opacity: 0.7,
  },
});
