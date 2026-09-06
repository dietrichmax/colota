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
}

export function SectionTitle({ children, style }: SectionTitleProps) {
  const { colors } = useTheme()

  return (
    <View style={style}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: space.md
  }
})
