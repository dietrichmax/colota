/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Route, RouteOff } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { MapOverlay } from "../../ui/MapOverlay"
import { size } from "../../../constants"

interface Props {
  onPress: () => void
  active: boolean
}

/** The glyph carries the state as well as the colour, so the switch reads without hue. */
export function TrackToggleButton({ onPress, active }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const Glyph = active ? Route : RouteOff

  return (
    <MapOverlay
      testID="track-toggle-btn"
      variant="control"
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={active ? t("map.hideTrack") : t("map.showTrack")}
      accessibilityState={{ checked: active }}
    >
      <Glyph size={size.icon.md} color={active ? colors.primary : colors.text} />
    </MapOverlay>
  )
}
