/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space } from "../../constants"
import { RadioDot } from "./RadioDot"

type RadioRowProps = {
  label: string
  selected: boolean
  onPress: () => void
  sub?: string
  icon?: LucideIcon
  /** A hairline below the row, from the text column. Omit on the last row of a group. */
  divider?: boolean
  testID?: string
}

/**
 * The whole row is the radio; RadioDot is decoration, which is why it is hidden from
 * accessibility and the state lives here.
 */
export function RadioRow({ label, selected, onPress, sub, icon: Icon, divider = false, testID }: RadioRowProps) {
  const { colors } = useTheme()

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={sub ? `${label}, ${sub}` : label}
        style={({ pressed }) => [styles.row, pressed && { opacity: colors.pressedOpacity }]}
      >
        <RadioDot selected={selected} />
        {Icon ? <Icon size={size.icon.md} color={colors.textSecondary} /> : null}
        <View style={styles.text}>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          {sub ? <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text> : null}
        </View>
      </Pressable>
      {divider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: size.row,
    paddingVertical: space.md
  },
  text: {
    flex: 1
  },
  label: {
    fontSize: fontSizes.input,
    ...fonts.medium
  },
  sub: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginTop: 2
  },
  divider: {
    height: 1,
    marginStart: size.iconColumn
  }
})
