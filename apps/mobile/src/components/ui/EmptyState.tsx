/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { space } from "../../constants"
import { Button } from "./Button"

type EmptyStateProps = {
  title: string
  message?: string
  actionLabel?: string
  onActionPress?: () => void
  testID?: string
}

/**
 * An empty list is a state, not an illustration: it stays on the text column with the
 * rest of the screen, so nothing is centred and there is no icon and no card.
 */
export function EmptyState({ title, message, actionLabel, onActionPress, testID }: EmptyStateProps) {
  const { colors } = useTheme()

  return (
    <View testID={testID} style={styles.root}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      {actionLabel && onActionPress ? (
        <Button title={actionLabel} variant="ghost" align="start" onPress={onActionPress} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "flex-start",
    paddingVertical: space.xl,
    gap: space.sm
  },
  title: {
    ...text.heading
  },
  message: {
    ...text.caption
  }
})
