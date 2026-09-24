/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Settings, House, CircleDot } from "lucide-react-native"
import { TrackMark } from "./TrackMark"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA, elevation } from "../../constants"
import type { RootStackRoute } from "../../types/navigation"
import { useTranslation } from "../../i18n/useTranslation"
import type { TranslationKey } from "../../i18n/options"

type TabIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

interface Tab {
  name: string
  labelKey: TranslationKey
  icon: TabIcon
  route: RootStackRoute
}

const TABS: Tab[] = [
  { name: "dashboard", labelKey: "tab.dashboard", icon: House, route: "Dashboard" },
  { name: "history", labelKey: "tab.history", icon: TrackMark, route: "Location History" },
  { name: "geofences", labelKey: "tab.geofences", icon: CircleDot, route: "Geofences" },
  { name: "settings", labelKey: "tab.settings", icon: Settings, route: "Settings" }
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
  const { t } = useTranslation()

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
            accessibilityLabel={t(tab.labelKey)}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
            style={styles.tab}
            onPress={() => onNavigate(tab.route)}
          >
            {/* The set has no filled variants, so weight is what marks the active glyph. */}
            <tab.icon size={size.icon.lg} color={color} strokeWidth={active ? ACTIVE_STROKE : undefined} />
            <Text numberOfLines={2} style={[styles.label, active && fonts.semiBold, { color }]}>
              {t(tab.labelKey)}
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
