/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet, ViewStyle, StyleProp, Text } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { space } from "../../constants"

type SectionTitleProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  color?: string
}

export function SectionTitle({ children, style, color }: SectionTitleProps) {
  const { colors } = useTheme()

  return (
    <View style={style}>
      <Text style={[styles.sectionTitle, { color: color ? color : colors.primary }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.small,
    textTransform: "uppercase",
    ...fonts.bold,
    letterSpacing: 1.2,
    marginBottom: space.md,
    paddingHorizontal: space.xs
  }
})
