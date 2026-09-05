/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useState } from "react"
import { Pressable, StyleSheet, View, type AccessibilityState, type StyleProp, type ViewStyle } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { elevation, size, space, STATE_LAYER_ALPHA } from "../../constants"
import { FocusRing } from "./FocusRing"

const RIPPLE_RADIUS = 20

type CommonProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

type SurfaceProps = CommonProps & {
  variant?: "surface"
  shape?: "rounded" | "pill"
}

type ControlProps = CommonProps & {
  variant: "control"
  onPress: () => void
  accessibilityLabel: string
  /** A disc for an icon-only control, a pill for one that carries a label. */
  shape?: "disc" | "pill"
  accessibilityRole?: "button" | "switch"
  accessibilityHint?: string
  accessibilityState?: AccessibilityState
}

type MapOverlayProps = SurfaceProps | ControlProps

/**
 * Everything drawn over map tiles - controls, the state chip, the popup, the legend and
 * the attribution - shares this surface, so the floating decision is made once. Dark mode
 * carries it on the tonal step alone: the rework allows no borders, and a ring over tiles
 * would be the only one in the app.
 */
export function MapOverlay(props: MapOverlayProps) {
  const { colors, mode } = useTheme()
  const [focused, setFocused] = useState(false)

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => setFocused(false), [])

  const surface: ViewStyle = {
    backgroundColor: colors.cardElevated,
    elevation: mode === "dark" ? 0 : elevation.floating
  }

  if (props.variant !== "control") {
    const { children, style, testID, shape = "rounded" } = props
    return (
      <View
        testID={testID}
        style={[styles.surface, surface, { borderRadius: shape === "pill" ? radius.pill : radius.lg }, style]}
      >
        {children}
      </View>
    )
  }

  const {
    children,
    style,
    testID,
    onPress,
    shape = "disc",
    accessibilityLabel,
    accessibilityRole = "button",
    accessibilityHint,
    accessibilityState
  } = props

  const pill = shape === "pill"

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: RIPPLE_RADIUS }}
      style={[pill ? [styles.pill, surface] : styles.target, style]}
    >
      <View style={pill ? styles.pillContent : [styles.disc, surface]} importantForAccessibility="no">
        {children}
      </View>
      <FocusRing visible={focused} color={colors.primary} radius={radius.pill} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  surface: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm
  },
  target: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  disc: {
    width: size.mapControl,
    height: size.mapControl,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  pill: {
    minHeight: size.touch,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    alignItems: "center",
    justifyContent: "center"
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  }
})
