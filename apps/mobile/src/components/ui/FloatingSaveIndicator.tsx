/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated } from "react-native"
import { Check } from "lucide-react-native"
import { SpinningLoader } from "./SpinningLoader"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space } from "../../constants"

interface Props {
  saving: boolean
  success: boolean
  /** Optional custom message. When provided, controls visibility instead of saving/success. */
  message?: string | null
  isError?: boolean
  colors: {
    info: string
    success: string
    error: string
    text: string
  }
}

export const FloatingSaveIndicator: React.FC<Props> = ({ saving, success, message, isError, colors }) => {
  const hasMessage = message != null
  const visible = hasMessage || saving || success

  const translateY = useRef(new Animated.Value(60)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 60, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start()
    }
  }, [visible, translateY, opacity])

  const displayText = hasMessage ? message : saving ? "Saving & restarting..." : "Saved"

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
      <View
        style={[
          styles.badge,
          {
            backgroundColor: saving ? colors.info : isError ? colors.error : colors.success
          }
        ]}
      >
        {saving ? (
          <SpinningLoader size={size.icon.sm} color={colors.text} />
        ) : !hasMessage ? (
          <Check size={size.icon.sm} color={colors.text} />
        ) : null}
        <Text style={[styles.text, { color: colors.text }]}>{displayText}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
    pointerEvents: "none"
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: 20,
    paddingVertical: space.md,
    borderRadius: 24,
    elevation: 8
  },
  text: { fontSize: fontSizes.body, ...fonts.semiBold }
})
