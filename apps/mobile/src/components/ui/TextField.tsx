/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useState } from "react"
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type StyleProp,
  type TextInputFocusEvent,
  type TextInputProps,
  type ViewStyle
} from "react-native"
import { CircleAlert } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { FieldMessage } from "./FieldMessage"
import { FocusRing } from "./FocusRing"

const COMPACT_HEIGHT = 40
const FIELD_PADDING = 14

type IconComponent = React.ComponentType<{ size?: number; color?: string }>

type TrailingAction = {
  icon: IconComponent
  onPress: () => void
  accessibilityLabel: string
  testID?: string
}

type TextFieldOwnProps = {
  hint?: string
  error?: string
  mono?: boolean
  figure?: boolean
  compact?: boolean
  leadingIcon?: IconComponent
  trailing?: TrailingAction
  containerStyle?: StyleProp<ViewStyle>
}

// A field whose only name is its placeholder loses that name the moment a value is typed,
// so one of the two has to be there.
type NamedProps = { label: string; accessibilityLabel?: string } | { label?: undefined; accessibilityLabel: string }

export type TextFieldProps = Omit<TextInputProps, "style"> & TextFieldOwnProps & NamedProps

export function TextField({
  label,
  hint,
  error,
  mono = false,
  figure = false,
  compact = false,
  leadingIcon: Leading,
  trailing,
  containerStyle,
  accessibilityLabel,
  editable = true,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  const handleFocus = useCallback(
    (event: TextInputFocusEvent) => {
      setFocused(true)
      onFocus?.(event)
    },
    [onFocus]
  )

  const handleBlur = useCallback(
    (event: TextInputFocusEvent) => {
      setFocused(false)
      onBlur?.(event)
    },
    [onBlur]
  )

  const invalid = Boolean(error)
  const strokeColor = !editable ? colors.border : invalid ? colors.error : focused ? colors.primary : colors.outline
  const strokeWidth = editable && (invalid || focused) ? 2 : 1
  const labelColor = !editable ? colors.textDisabled : focused ? colors.primary : colors.textSecondary
  const inkColor = editable ? colors.text : colors.textDisabled
  const inputRole = mono ? text.mono : figure ? text.figureInline : text.body

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          compact ? styles.compact : styles.standard,
          trailing ? styles.fieldWithTrailing : null,
          { borderColor: strokeColor, borderWidth: strokeWidth }
        ]}
      >
        {Leading ? (
          <View style={styles.leading} importantForAccessibility="no">
            <Leading size={size.icon.md} color={colors.textSecondary} />
          </View>
        ) : null}
        <TextInput
          {...inputProps}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          style={[styles.input, inputRole, figure && styles.centered, { color: inkColor }]}
          placeholderTextColor={colors.placeholder}
          cursorColor={colors.primary}
          selectionColor={colors.primary}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {invalid ? (
          <View style={styles.alert} importantForAccessibility="no">
            <CircleAlert size={size.icon.md} color={colors.error} />
          </View>
        ) : null}
        {trailing ? (
          <Pressable
            testID={trailing.testID}
            onPress={trailing.onPress}
            disabled={!editable}
            accessibilityRole="button"
            accessibilityLabel={trailing.accessibilityLabel}
            android_ripple={
              editable ? { color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: 20 } : undefined
            }
            style={styles.trailing}
          >
            <trailing.icon size={size.icon.md} color={editable ? colors.textSecondary : colors.textDisabled} />
          </Pressable>
        ) : null}
        <FocusRing visible={focused} color={colors.primary} radius={radius.sm} />
      </View>
      {error ? <FieldMessage variant="error">{error}</FieldMessage> : hint ? <FieldMessage>{hint}</FieldMessage> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    ...text.label,
    marginBottom: space.xs
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: "transparent",
    paddingHorizontal: FIELD_PADDING
  },
  standard: {
    minHeight: size.touch
  },
  compact: {
    minHeight: COMPACT_HEIGHT
  },
  fieldWithTrailing: {
    paddingEnd: 0
  },
  leading: {
    marginEnd: space.sm
  },
  input: {
    flex: 1,
    paddingVertical: 0
  },
  centered: {
    textAlign: "center"
  },
  alert: {
    marginStart: space.sm
  },
  trailing: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  }
})
