/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Settings, House, CircleDot, Route } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA, elevation } from "../../constants"
import type { RootStackRoute } from "../../types/navigation"

type TabIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

interface Tab {
  name: string
  label: string
  icon: TabIcon
  route: RootStackRoute
}

const TABS: Tab[] = [
  { name: "dashboard", label: "Dashboard", icon: House, route: "Dashboard" },
  { name: "history", label: "History", icon: Route, route: "Location History" },
  { name: "geofences", label: "Geofences", icon: CircleDot, route: "Geofences" },
  { name: "settings", label: "Settings", icon: Settings, route: "Settings" }
]

/** Routes where the tab bar is visible. The one list; App.tsx reads it rather than repeating it. */
// Typed loosely on purpose: lookups come from navigation state, which is a bare string.
export const TAB_ROUTES: Set<string> = new Set(TABS.map((t) => t.route))

/** The semibold of a glyph: with no filled variants in the set, weight carries the active tab. */
const ACTIVE_STROKE = 2.25

interface BottomTabBarProps {
  currentRoute: string | undefined
  onNavigate: (route: RootStackRoute) => void
}

export function BottomTabBar({ currentRoute, onNavigate }: BottomTabBarProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  if (!currentRoute || !TAB_ROUTES.has(currentRoute)) return null

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingBottom: insets.bottom + space.sm
        }
      ]}
    >
      {TABS.map((tab) => {
        const active = currentRoute === tab.route
        const color = active ? colors.primary : colors.textSecondary
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
            style={styles.tab}
            onPress={() => onNavigate(tab.route)}
          >
            {/* The set has no filled variants, so weight is what marks the active glyph. */}
            <tab.icon size={size.icon.lg} color={color} strokeWidth={active ? ACTIVE_STROKE : undefined} />
            <Text numberOfLines={2} style={[styles.label, active && fonts.semiBold, { color }]}>
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingTop: space.sm,
    paddingBottom: space.sm,
    elevation: elevation.flat
  },
  tab: {
    flex: 1,
    minHeight: size.row,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs
  },
  label: {
    fontSize: fontSizes.small,
    ...fonts.medium
  }
})
