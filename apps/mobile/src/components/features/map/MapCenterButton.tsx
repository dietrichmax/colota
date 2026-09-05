/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { ViewStyle, StyleProp, StyleSheet } from "react-native"
import { LocateFixed } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { MapOverlay } from "../../ui/MapOverlay"
import { size, space } from "../../../constants"

interface Props {
  onPress: () => void
  visible: boolean
  /** False places the control in a caller-owned stack; true keeps the standalone corner position. */
  floating?: boolean
  style?: StyleProp<ViewStyle>
}

export const MapCenterButton: React.FC<Props> = ({ onPress, visible, floating = true, style }) => {
  const { colors } = useTheme()
  const { t } = useTranslation()

  if (!visible) return null

  return (
    <MapOverlay
      testID="map-centre-btn"
      variant="control"
      onPress={onPress}
      accessibilityLabel={t("map.centre")}
      style={[floating && styles.floating, style]}
    >
      <LocateFixed size={size.icon.md} color={colors.text} />
    </MapOverlay>
  )
}

const styles = StyleSheet.create({
  floating: {
    position: "absolute",
    end: space.lg,
    bottom: 78
  }
})
