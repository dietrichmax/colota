/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { forwardRef, useState } from "react"
import { View, Text, TextInput, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native"
import type { TextInputProps, TextInputInstance } from "react-native"
import { Eye, EyeOff, CircleAlert, ChevronRight } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space, HIT_SLOP_MD, STATE_LAYER_ALPHA } from "../../constants"
import { radius } from "@colota/shared"
import { FieldMessage } from "./FieldMessage"

/**
 * Distance from the outer edge to the text. The resting field has no border, only a fill; the
 * ring appears on focus and on error, so the padding shrinks by the same amount it grows or
 * the text jumps sideways as you tap in.
 */
const FIELD_INSET = 15

/** The three-line box a pasted token or note needs, which one touch target does not give it. */
const MULTILINE_MIN_HEIGHT = 80

type BaseProps = Omit<TextInputProps, "style" | "editable" | "secureTextEntry"> & {
  error?: string | boolean
  disabled?: boolean
  secure?: boolean
  mono?: boolean
  border?: boolean
  figure?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

type TextFieldProps = BaseProps &
  ({ label: string; accessibilityLabel?: string } | { label?: undefined; accessibilityLabel: string })

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextFieldInput(
  {
    label,
    accessibilityLabel,
    error,
    disabled = false,
    secure = false,
    mono = false,
    border = false,
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
  const borderWidth = error || (focused && !disabled) ? 2 : border ? 1 : 0
  const borderColor = error ? colors.error : focused && !disabled ? colors.primary : colors.border
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
            backgroundColor: colors.well
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
          numberOfLines={multiline ? undefined : 1}
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
          <CircleAlert
            size={size.icon.md}
            color={colors.error}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
      </View>
      {typeof error === "string" ? <FieldMessage variant="error">{error}</FieldMessage> : null}
    </View>
  )
})

type SelectFieldProps = {
  label: string
  value?: string
  placeholder: string
  onPress: () => void
  error?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** TextField's look for a value picked on another screen: the box opens the picker instead of a keyboard. */
export function SelectField({ label, value, placeholder, onPress, error, style, testID }: SelectFieldProps) {
  const { colors } = useTheme()
  const borderWidth = error ? 2 : 0

  return (
    <View style={style}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.selectBox, { borderWidth, borderColor: colors.error, backgroundColor: colors.well }]}>
        <Pressable
          testID={testID}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={[label, value ?? placeholder, error].filter(Boolean).join(", ")}
          android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
          style={[styles.select, { paddingHorizontal: FIELD_INSET - borderWidth }]}
        >
          <Text numberOfLines={1} style={[styles.input, { color: value ? colors.text : colors.textLight }]}>
            {value ?? placeholder}
          </Text>
          <ChevronRight size={size.icon.md} color={colors.textSecondary} />
        </Pressable>
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
  },
  figure: {
    textAlign: "center",
    ...fonts.medium,
    fontVariant: ["tabular-nums"]
  },
  selectBox: {
    borderRadius: radius.sm,
    overflow: "hidden"
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: size.touch
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
