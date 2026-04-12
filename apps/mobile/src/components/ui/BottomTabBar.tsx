/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { Settings, LucideIcon, MapPinned, MapPinHouse, Route } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts } from "../../styles/typography"

interface Tab {
  name: string
  label: string
  icon: LucideIcon
  route: string
}

const TABS: Tab[] = [
  { name: "dashboard", label: "Dashboard", icon: MapPinned, route: "Dashboard" },
  { name: "history", label: "History", icon: Route, route: "Location History" },
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

  if (!currentRoute || !TAB_ROUTES.has(currentRoute)) return null

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border
        }
      ]}
    >
      {TABS.map((tab) => {
        const active = currentRoute === tab.route
        const color = active ? colors.primary : colors.textLight
        return (
          <Pressable
            key={tab.name}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
            onPress={() => onNavigate(tab.route)}
          >
            <tab.icon size={22} color={color} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
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
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 6
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  label: {
    fontSize: 11,
    ...fonts.medium
  }
})
