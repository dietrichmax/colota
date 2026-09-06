/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Switch } from "react-native"
import { useTheme } from "../../hooks/useTheme"

type ToggleProps = {
  value: boolean
  onValueChange: (value: boolean) => void
  /** In the row's own visible words, so Voice Access can resolve it. */
  accessibilityLabel: string
  disabled?: boolean
  testID?: string
}

/**
 * The one switch. Thirteen call sites each built the same two colour objects by hand, so the
 * track and thumb live here instead. Every switch takes the same hue: a semantic colour marks
 * a state, and a toggle being on is not a warning.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  testID
}: ToggleProps) {
  const { colors } = useTheme()
  return (
    <Switch
      testID={testID}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: undefined, true: colors.primary + "80" }}
      thumbColor={value ? colors.primary : undefined}
    />
  )
}
