/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState } from "react"
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps, StyleProp, ViewStyle } from "react-native"
import { Eye, EyeOff, CircleAlert } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space, HIT_SLOP_MD } from "../../constants"
import { radius } from "@colota/shared"
import { FieldMessage } from "./FieldMessage"

/**
 * Distance from the outer edge to the text. The border grows from 1 to 2 on focus and on
 * error, so the padding shrinks by the same amount or the text jumps sideways as you tap in.
 */
const FIELD_INSET = 15

type BaseProps = Omit<TextInputProps, "style" | "editable" | "secureTextEntry"> & {
  error?: string
  disabled?: boolean
  secure?: boolean
  mono?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

type TextFieldProps = BaseProps &
  ({ label: string; accessibilityLabel?: string } | { label?: undefined; accessibilityLabel: string })

export function TextField({
  label,
  accessibilityLabel,
  error,
  disabled = false,
  secure = false,
  mono = false,
  style,
  testID,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const name = label ?? accessibilityLabel ?? ""
  const borderWidth = error || (focused && !disabled) ? 2 : 1
  const borderColor = disabled ? colors.border : error ? colors.error : focused ? colors.primary : colors.border
  const RevealIcon = revealed ? EyeOff : Eye
  const labelColor = disabled ? colors.textDisabled : focused ? colors.primary : colors.textSecondary

  return (
    <View style={style}>
      {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      <View
        testID={testID ? `${testID}-box` : undefined}
        style={[styles.box, { borderWidth, borderColor, paddingHorizontal: FIELD_INSET - borderWidth }]}
      >
        <TextInput
          testID={testID}
          editable={!disabled}
          secureTextEntry={secure && !revealed}
          accessibilityLabel={error ? `${name}, ${error}` : name}
          placeholderTextColor={colors.textLight}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[styles.input, mono && styles.mono, { color: disabled ? colors.textDisabled : colors.text }]}
          {...inputProps}
        />
        {secure ? (
          <Pressable
            testID={testID ? `${testID}-reveal` : undefined}
            onPressIn={() => setRevealed(true)}
            onPressOut={() => setRevealed(false)}
            disabled={disabled}
            hitSlop={HIT_SLOP_MD}
            accessibilityRole="button"
            accessibilityLabel={`Hold to show ${name}`}
          >
            <RevealIcon size={size.icon.md} color={disabled ? colors.textDisabled : colors.textSecondary} />
          </Pressable>
        ) : error ? (
          <CircleAlert size={size.icon.md} color={colors.error} accessibilityElementsHidden importantForAccessibility="no" />
        ) : null}
      </View>
      {error ? <FieldMessage variant="error">{error}</FieldMessage> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSizes.description,
    ...fonts.medium,
    marginBottom: space.sm
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: size.touch,
    borderRadius: radius.sm
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    textAlignVertical: "center",
    fontSize: fontSizes.input,
    ...fonts.regular
  },
  mono: {
    fontFamily: "monospace"
  }
})
