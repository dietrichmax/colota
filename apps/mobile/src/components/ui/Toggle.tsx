/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Switch } from "react-native"
import { useTheme } from "../../hooks/useTheme"

type ToggleTone = "primary" | "warning"

type ToggleProps = {
  value: boolean
  onValueChange: (value: boolean) => void
  /** In the row's own visible words, so Voice Access can resolve it. */
  accessibilityLabel: string
  disabled?: boolean
  tone?: ToggleTone
  testID?: string
}

/**
 * The one switch. Thirteen call sites each built the same two colour objects by hand, so the
 * track and thumb live here instead. tone exists because the geofence pause toggle paints
 * warning rather than primary; every other caller takes the default.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  tone = "primary",
  testID
}: ToggleProps) {
  const { colors } = useTheme()
  const hue = tone === "warning" ? colors.warning : colors.primary

  return (
    <Switch
      testID={testID}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: undefined, true: hue + "80" }}
      thumbColor={value ? hue : undefined}
    />
  )
}
