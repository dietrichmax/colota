/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet, ViewStyle, StyleProp, Text, Pressable } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"

type SectionTitleAction = {
  label: string
  onPress: () => void
  testID?: string
}

type SectionTitleProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  first?: boolean
  action?: SectionTitleAction
  testID?: string
}

export function SectionTitle({ children, style, first = false, action, testID }: SectionTitleProps) {
  const { colors } = useTheme()

  return (
    <View testID={testID} style={[styles.container, first && styles.first, style]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {children}
      </Text>
      {action ? (
        <Pressable
          testID={action.testID}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          android_ripple={{ color: colors.primaryDark + STATE_LAYER_ALPHA }}
          style={styles.action}
        >
          <Text style={[styles.actionLabel, { color: colors.primaryDark }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xxl,
    marginBottom: space.sm
  },
  first: {
    marginTop: 0
  },
  title: {
    ...text.heading,
    flexShrink: 1
  },
  action: {
    minHeight: size.touch,
    justifyContent: "center",
    paddingStart: space.md
  },
  actionLabel: {
    ...text.bodyStrong
  }
})
