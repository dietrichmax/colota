/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { View, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { space } from "../../constants"

type DividerProps = {
  inset?: number
  tight?: boolean
  testID?: string
}

export const Divider = ({ inset = 0, tight = false, testID }: DividerProps) => {
  const { colors } = useTheme()

  return (
    <View
      testID={testID}
      style={[styles.divider, { backgroundColor: colors.border, marginStart: inset }, tight && styles.tight]}
    />
  )
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    // The 55 call sites that predate the row spacing still lean on this margin.
    marginVertical: space.lg
  },
  tight: {
    marginVertical: 0
  }
})
