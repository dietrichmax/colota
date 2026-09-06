/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { space, size } from "../../constants"

/** Where a ListItem's text starts inside its card: past the icon and the gap after it. */
const TEXT_COLUMN = size.icon.md + space.lg

type DividerProps = {
  /** Between rows of one group, where the rows already carry their own vertical padding. */
  tight?: boolean
  /** Starts at the text column, for a group whose rows have a leading icon. */
  inset?: boolean
}

export const Divider = ({ tight = false, inset = false }: DividerProps) => {
  const { colors } = useTheme()

  return (
    <View
      style={[
        styles.divider,
        tight && styles.tight,
        inset && styles.inset,
        { backgroundColor: colors.divider }
      ]}
    />
  )
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space.lg
  },
  tight: {
    marginVertical: 0
  },
  inset: {
    marginStart: TEXT_COLUMN
  }
})
