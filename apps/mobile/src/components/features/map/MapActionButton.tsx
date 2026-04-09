/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native"
import { useTheme } from "../../../hooks/useTheme"

interface Props {
  onPress: () => void
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

export function MapActionButton({ onPress, style, children }: Props) {
  const { colors } = useTheme()

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
        pressed && { opacity: colors.pressedOpacity }
      ]}
      onPress={onPress}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderWidth: 1,
    zIndex: 10
  },
  right: { right: 16 },
  left: { left: 16 }
})

export { styles as mapActionStyles }
