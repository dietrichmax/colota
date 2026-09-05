/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { ViewStyle, StyleProp, StyleSheet } from "react-native"
import { LocateFixed } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { MapActionButton, mapActionStyles } from "./MapActionButton"

interface Props {
  onPress: () => void
  visible: boolean
  style?: StyleProp<ViewStyle>
}

export const MapCenterButton: React.FC<Props> = ({ onPress, visible, style }) => {
  const { colors } = useTheme()

  if (!visible) return null

  return (
    <MapActionButton onPress={onPress} style={[mapActionStyles.right, styles.position, style]}>
      <LocateFixed size={20} color={colors.textLight} />
    </MapActionButton>
  )
}

const styles = StyleSheet.create({
  position: { bottom: 78 }
})
