/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRoute } from "@react-navigation/native"
import { useTheme } from "../../hooks/useTheme"
import { TAB_ROUTES } from "./BottomTabBar"

type ContainerProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

// Requires NavigationContainer: uses useRoute to skip the bottom inset on tab
// routes, where BottomTabBar already consumes the safe area.
export function Container({ children, style }: ContainerProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute()

  const paddingBottom = TAB_ROUTES.has(route.name) ? 0 : insets.bottom

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingBottom }, style]}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1
  }
})
