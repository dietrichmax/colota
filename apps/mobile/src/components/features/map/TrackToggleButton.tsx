/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Route } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { MapActionButton, mapActionStyles } from "./MapActionButton"
import { size } from "../../../constants"

interface Props {
  onPress: () => void
  active: boolean
}

export function TrackToggleButton({ onPress, active }: Props) {
  const { colors } = useTheme()

  return (
    <MapActionButton onPress={onPress} style={mapActionStyles.left}>
      <Route size={size.icon.md} color={active ? colors.primary : colors.textLight} />
    </MapActionButton>
  )
}
