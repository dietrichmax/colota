/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Animated,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { useReduceMotion } from "../../hooks/useReduceMotion"
import { text } from "../../styles/typography"
import { motion, size, space } from "../../constants"

type IconComponent = React.ComponentType<{ size?: number; color?: string }>

const MAX_HEIGHT_RATIO = 0.9

type SheetProps = {
  visible: boolean
  title: string
  children: React.ReactNode
  actions: React.ReactNode
  /** Left out for a blocking sheet: no scrim tap, and back does not reach the sheet. */
  onDismiss?: () => void
  icon?: IconComponent
  iconColor?: string
  testID?: string
}

/**
 * The one bottom sheet in the app: `AppModal` and `DisclosureModal` are both this
 * surface with different content. The body scrolls and the actions stay pinned below
 * it, so a long disclosure still shows its buttons at a 2.0x font scale.
 */
export function Sheet({ visible, title, children, actions, onDismiss, icon: Icon, iconColor, testID }: SheetProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reduceMotion = useReduceMotion()
  const [renderable, setRenderable] = useState(visible)
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null)

  const focusTitle = useCallback(() => {
    const tag = findNodeHandle(titleRef.current)
    if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
  }, [])

  useEffect(() => {
    if (visible) setRenderable(true)
  }, [visible])

  useEffect(() => {
    if (!renderable) return

    const entering = visible
    const spec = entering ? motion.enter : motion.exit
    const animation = Animated.timing(progress, {
      toValue: entering ? 1 : 0,
      duration: reduceMotion ? 0 : spec.duration,
      easing: spec.easing,
      useNativeDriver: true
    })

    animation.start(({ finished }) => {
      if (!finished) return
      if (entering) focusTitle()
      else setRenderable(false)
    })

    return () => animation.stop()
  }, [visible, renderable, reduceMotion, progress, focusTitle])

  if (!renderable) return null

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] })

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
          {onDismiss ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onDismiss}
            />
          ) : null}
        </Animated.View>

        <Animated.View
          testID={testID}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              maxHeight: height * MAX_HEIGHT_RATIO,
              paddingBottom: space.xl + insets.bottom,
              transform: [{ translateY }]
            }
          ]}
        >
          <View style={styles.header}>
            {Icon ? (
              <View importantForAccessibility="no">
                <Icon size={size.icon.md} color={iconColor ?? colors.text} />
              </View>
            ) : null}
            <Text ref={titleRef} accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          </View>

          <ScrollView testID="sheet-body" style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>

          <View testID="sheet-actions" style={styles.actions}>
            {actions}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end"
  },
  sheet: {
    width: "100%",
    maxWidth: size.column,
    alignSelf: "center",
    borderTopStartRadius: radius.lg,
    borderTopEndRadius: radius.lg,
    padding: space.xl
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  title: {
    ...text.title,
    flexShrink: 1
  },
  body: {
    flexShrink: 1
  },
  bodyContent: {
    paddingTop: space.md
  },
  actions: {
    marginTop: space.lg,
    gap: space.sm
  }
})
