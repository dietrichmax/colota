/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, StyleSheet } from "react-native"
import { type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"

type HeaderActionProps = {
  icon: LucideIcon
  /** Required: the glyph carries no text, so nothing else names this control. */
  label: string
  hint?: string
  /** The glyph colour; `text` unless the action is destructive or explains itself when pressed. */
  color?: string
  disabled?: boolean
  onPress: () => void
  testID?: string
}

/** An icon-only action for the app bar: a 24 glyph inside 12 of padding, so the 48 target sits on the grid. */
export function HeaderAction({ icon: Icon, label, hint, color, disabled = false, onPress, testID }: HeaderActionProps) {
  const { colors } = useTheme()
  const tint = disabled ? colors.textDisabled : (color ?? colors.text)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={
        disabled ? undefined : { color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: size.touch / 2 }
      }
      style={styles.action}
      testID={testID}
    >
      <Icon size={size.icon.lg} color={tint} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  action: {
    padding: space.md
  }
})
