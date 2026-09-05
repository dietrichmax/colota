/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Settings, LucideIcon, House, MapPinHouse, Waypoints } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts, text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"

// The set has no filled variants, so the active tab is carried by weight instead.
const ACTIVE_STROKE_WIDTH = 2.25
const RIPPLE_RADIUS = 20

interface Tab {
  name: string
  label: string
  icon: LucideIcon
  route: string
}

const TABS: Tab[] = [
  { name: "dashboard", label: "Dashboard", icon: House, route: "Dashboard" },
  { name: "history", label: "History", icon: Waypoints, route: "Location History" },
  { name: "geofences", label: "Geofences", icon: MapPinHouse, route: "Geofences" },
  { name: "settings", label: "Settings", icon: Settings, route: "Settings" }
]

/** Routes where the tab bar is visible. */
const TAB_ROUTES = new Set(TABS.map((t) => t.route))

interface BottomTabBarProps {
  currentRoute: string | undefined
  onNavigate: (route: string) => void
}

export function BottomTabBar({ currentRoute, onNavigate }: BottomTabBarProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  if (!currentRoute || !TAB_ROUTES.has(currentRoute)) return null

  return (
    <View
      testID="bottom-tab-bar"
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          minHeight: size.row + insets.bottom,
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
            testID={`tab-${tab.name}`}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: RIPPLE_RADIUS }}
            style={({ pressed }) => [styles.tab, pressed && { opacity: colors.pressedOpacity }]}
            onPress={() => onNavigate(tab.route)}
          >
            <tab.icon size={size.icon.lg} color={color} strokeWidth={active ? ACTIVE_STROKE_WIDTH : undefined} />
            <Text numberOfLines={2} style={[styles.label, active && fonts.semiBold, { color }]}>
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export { TAB_ROUTES }

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingTop: space.sm
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
    gap: space.xs
  },
  label: {
    ...text.caption,
    textAlign: "center"
  }
})
