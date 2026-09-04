/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { space } from "../../constants"

const MIN_WIDTH = 240

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
    start: 0,
    end: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center"
  },
  card: {
    padding: space.xl,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: space.sm,
    minWidth: MIN_WIDTH
  },
  title: {
    ...text.bodyStrong
  },
  message: {
    ...text.body,
    textAlign: "center"
  }
})
