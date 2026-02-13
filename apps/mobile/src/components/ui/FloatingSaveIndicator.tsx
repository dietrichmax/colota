/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"

interface Props {
  saving: boolean
  success: boolean
  /** Optional custom message. When provided, controls visibility instead of saving/success. */
  message?: string | null
  colors: {
    info: string
    success: string
    text: string
  }
}

export const FloatingSaveIndicator: React.FC<Props> = ({ saving, success, message, colors }) => {
  const hasMessage = message != null
  const visible = hasMessage || saving || success

  if (!visible) return null

  const displayText = hasMessage ? message : saving ? "⏳ Saving & restarting..." : "✓ Saved"

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: saving ? colors.info : colors.success,
            shadowColor: saving ? colors.info : colors.success
          }
        ]}
      >
        <Text style={[styles.text, { color: colors.text }]}>{displayText}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
    pointerEvents: "none"
  },
  badge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  text: { fontSize: 14, fontWeight: "600" }
})
