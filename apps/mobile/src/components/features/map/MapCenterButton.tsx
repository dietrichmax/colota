/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native"
import { LocateFixed } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"

interface Props {
  onPress: () => void
  visible: boolean
  style?: StyleProp<ViewStyle>
}

export const MapCenterButton: React.FC<Props> = ({ onPress, visible, style }) => {
  const { colors } = useTheme()

  if (!visible) return null

  return (
    <Pressable
      style={({ pressed }) => [
        styles.centerButton,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
        pressed && { opacity: 0.7 }
      ]}
      onPress={onPress}
    >
      <LocateFixed size={24} color={colors.text} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  centerButton: {
    position: "absolute",
    bottom: 30,
    right: 16,
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
  }
})
