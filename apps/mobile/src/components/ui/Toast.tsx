/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { useReduceMotion } from "../../hooks/useReduceMotion"
import { text } from "../../styles/typography"
import { motion, space } from "../../constants"

const ENTER_OFFSET = 60

type ToastProps = {
  saving: boolean
  success: boolean
  /** Optional custom message. When provided, controls visibility instead of saving/success. */
  message?: string | null
  isError?: boolean
  testID?: string
}

/**
 * One line of text on the inverse surface. The status is the words: a glyph and a hue
 * would say the same thing twice, and a coloured badge is the template idiom the rework
 * removes.
 *
 * It unmounts when it is done rather than fading to zero, because a live region that
 * stays mounted announces itself again on dismissal and on every silent text change.
 */
export function Toast({ saving, success, message, isError, testID }: ToastProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const hasMessage = message != null
  const visible = hasMessage || saving || success

  const translateY = useRef(new Animated.Value(ENTER_OFFSET)).current

  useEffect(() => {
    if (!visible) {
      translateY.setValue(ENTER_OFFSET)
      return
    }
    Animated.timing(translateY, {
      toValue: 0,
      duration: reduceMotion ? 0 : motion.enter.duration,
      easing: motion.enter.easing,
      useNativeDriver: true
    }).start()
  }, [visible, reduceMotion, translateY])

  if (!visible) return null

  const displayText = hasMessage ? message : saving ? "Saving & restarting..." : "Saved"

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]} pointerEvents="none">
      <View testID="toast-surface" style={[styles.toast, { backgroundColor: colors.inverseSurface }]}>
        <Text
          accessibilityLiveRegion={isError ? "assertive" : "polite"}
          style={[styles.text, { color: colors.inverseOnSurface }]}
          testID={testID}
        >
          {displayText}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: space.xl,
    start: 0,
    end: 0,
    alignItems: "center",
    zIndex: 1000,
    pointerEvents: "none"
  },
  toast: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.sm
  },
  text: {
    ...text.bodyStrong
  }
})
