/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native"
import { useTheme } from "../../hooks/useTheme"

type CardProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  danger?: boolean
}

export function Card({ children, style, danger = false }: CardProps) {
  const { colors } = useTheme()

  const borderWidth = danger ? 2 : 1

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: danger ? colors.error + "10" : colors.card,
          borderColor: danger ? colors.error : colors.border,
          borderWidth
        },
        style
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%"
  }
})
