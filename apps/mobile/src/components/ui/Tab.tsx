/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useState } from "react"
import { Pressable, Text, StyleSheet, View } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { ThemeColors } from "../../types/global"
import { FocusRing } from "./FocusRing"

const RULE_HEIGHT = 2

interface TabProps {
  label: string
  active: boolean
  onPress: () => void
  /** Ignored: the tab reads the theme itself. PR 15 removes it from the call sites. */
  colors?: ThemeColors
  testID?: string
}

/** An in-screen tab: the rule sits under the label, not under the row. */
export function Tab({ label, active, onPress, testID }: TabProps) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => setFocused(false), [])

  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={styles.tab}
    >
      <View>
        <Text style={[styles.label, { color: active ? colors.text : colors.textSecondary }]}>{label}</Text>
        {active ? <View testID="tab-rule" style={[styles.rule, { backgroundColor: colors.primary }]} /> : null}
      </View>
      <FocusRing visible={focused} color={colors.primary} radius={radius.sm} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    ...text.bodyStrong
  },
  rule: {
    height: RULE_HEIGHT,
    marginTop: space.xs
  }
})
