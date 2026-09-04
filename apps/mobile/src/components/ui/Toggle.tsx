/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Pressable, StyleSheet } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { useReduceMotion } from "../../hooks/useReduceMotion"
import { motion, size, space, STATE_LAYER_ALPHA } from "../../constants"
import { FocusRing } from "./FocusRing"

const TRACK_HEIGHT = 32
const THUMB = 24
const THUMB_INSET = (TRACK_HEIGHT - THUMB) / 2
const TRAVEL = size.pill - THUMB - THUMB_INSET * 2

type ToggleProps = {
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
  accessibilityLabel: string
  accessibilityHint?: string
  testID?: string
}

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID
}: ToggleProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const [focused, setFocused] = useState(false)
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: reduceMotion ? 0 : motion.control.duration,
      easing: motion.control.easing,
      useNativeDriver: true
    }).start()
  }, [value, reduceMotion, progress])

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => setFocused(false), [])

  const trackColor = disabled
    ? colors.well
    : progress.interpolate({ inputRange: [0, 1], outputRange: [colors.outline, colors.primaryContainer] })
  const thumbColor = disabled
    ? colors.textDisabled
    : progress.interpolate({ inputRange: [0, 1], outputRange: [colors.card, colors.primary] })
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] })

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      onFocus={onFocus}
      onBlur={onBlur}
      android_ripple={disabled ? undefined : { color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: 20 }}
      style={styles.target}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { backgroundColor: thumbColor, transform: [{ translateX }] }]} />
        <FocusRing visible={focused && !disabled} color={colors.primary} radius={radius.pill} />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  target: {
    minHeight: size.touch,
    minWidth: size.touch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs
  },
  track: {
    width: size.pill,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    justifyContent: "center",
    paddingHorizontal: THUMB_INSET
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2
  }
})
