/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts } from "../../styles/typography"

type Props = {
  visible: boolean
  title: string
  message?: string
}

export function LoadingOverlay({ visible, title, message }: Props) {
  const { colors } = useTheme()
  if (!visible) return null
  return (
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center"
  },
  card: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 240
  },
  title: {
    fontSize: 16,
    ...fonts.semiBold,
    marginTop: 16,
    marginBottom: 8
  },
  message: {
    fontSize: 13,
    textAlign: "center"
  }
})
