/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Route, RouteOff } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { MapActionButton, mapActionStyles } from "./MapActionButton"
import { size } from "../../../constants"

interface Props {
  onPress: () => void
  active: boolean
  anchored?: boolean
}

export function TrackToggleButton({ onPress, active, anchored = true }: Props) {
  const { colors } = useTheme()

  return (
    <MapActionButton
      onPress={onPress}
      style={anchored && mapActionStyles.left}
      anchored={anchored}
      accessibilityRole="button"
      accessibilityLabel={active ? "Hide today's track" : "Show today's track"}
      accessibilityState={{ selected: active }}
    >
      {active ? (
        <Route size={size.icon.md} color={colors.primary} />
      ) : (
        <RouteOff size={size.icon.md} color={colors.textLight} />
      )}
    </MapActionButton>
  )
}
