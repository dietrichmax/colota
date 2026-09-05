/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { forwardRef, useState } from "react"
import { View, Text, TextInput, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native"
import type { TextInputProps, TextInputInstance } from "react-native"
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

/** The three-line box a pasted token or note needs, which one touch target does not give it. */
const MULTILINE_MIN_HEIGHT = 80

type BaseProps = Omit<TextInputProps, "style" | "editable" | "secureTextEntry"> & {
  /** A string shows the ring and the message; true shows the ring alone, when a caller says it elsewhere. */
  error?: string | boolean
  disabled?: boolean
  secure?: boolean
  mono?: boolean
  /** A number the user reads back: centred and weighted, so the value is the thing you see. */
  figure?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

type TextFieldProps = BaseProps &
  ({ label: string; accessibilityLabel?: string } | { label?: undefined; accessibilityLabel: string })

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  {
  label,
  accessibilityLabel,
  error,
  disabled = false,
  secure = false,
  mono = false,
  figure = false,
  style,
  testID,
  onFocus,
  onBlur,
    multiline = false,
    ...inputProps
  },
  ref
) {
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
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          {
            borderWidth,
            borderColor,
            paddingHorizontal: FIELD_INSET - borderWidth,
            backgroundColor: colors.background
          }
        ]}
      >
        <TextInput
          ref={ref}
          testID={testID}
          editable={!disabled}
          secureTextEntry={secure && !revealed}
          accessibilityLabel={typeof error === "string" ? `${name}, ${error}` : name}
          placeholderTextColor={colors.textLight}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          multiline={multiline}
          style={[
            styles.input,
            mono && styles.mono,
            figure && styles.figure,
            multiline && styles.multiline,
            { color: disabled ? colors.textDisabled : colors.text }
          ]}
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
      {typeof error === "string" ? <FieldMessage variant="error">{error}</FieldMessage> : null}
    </View>
  )
})

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
  },
  figure: {
    textAlign: "center",
    ...fonts.medium
  },
  boxMultiline: {
    alignItems: "flex-start",
    minHeight: MULTILINE_MIN_HEIGHT,
    paddingVertical: space.md
  },
  multiline: {
    textAlignVertical: "top"
  }
})
