/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { useMemo, useState, useCallback } from "react"
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { View, StatusBar, Platform, StyleSheet } from "react-native"
import { LucideProvider } from "lucide-react-native"
import { ThemeProvider, useTheme } from "./src/hooks/useTheme"
import { text } from "./src/styles/typography"
import { TrackingProvider } from "./src/contexts/TrackingProvider"
import { ErrorBoundary } from "./src/components/ui/ErrorBoundary"
import type { RootStackParamList, RootStackRoute } from "./src/types/navigation"

import "./src/i18n"
import {
  ActivityLogScreen,
  DashboardScreen,
  SettingsScreen,
  ApiSettingsScreen,
  AuthSettingsScreen,
  MtlsSettingsScreen,
  AutoExportScreen,
  GeofenceScreen,
  GeofenceEditorScreen,
  DataManagementScreen,
  LocationHistoryScreen,
  LocationSummaryScreen,
  ExportLocationsScreen,
  ImportLocationsScreen,
  AboutScreen,
  TrackingProfilesScreen,
  ProfileEditorScreen,
  SetupImportScreen,
  ShareSetupScreen,
  TripDetailScreen,
  OfflineMapsScreen,
  AppearanceScreen,
  ConnectionScreen,
  TrackingSyncScreen,
  BackupRestoreScreen
} from "./src/screens/"
import { BottomTabBar } from "./src/components"
import { loadDisplayPreferences } from "./src/utils/geo"
import { registerTileServerUserAgent } from "./src/utils/tileHeaders"

// Load display preferences early
loadDisplayPreferences()

registerTileServerUserAgent()

const Stack = createNativeStackNavigator<RootStackParamList>()

// One weight for the whole set. absoluteStrokeWidth keeps it 1.5 device pixels at every
// size, so a 16 badge and a 24 tab glyph read the same rather than the 16 reading heavier.
const ICON_STROKE_WIDTH = 1.5

type ScreenConfig = {
  name: RootStackRoute
  component: React.ComponentType<any>
  title: string
  headerShown?: boolean
}

const SCREEN_CONFIG: readonly ScreenConfig[] = [
  {
    // The map is the hero and bleeds under the status bar, so no header sits above it.
    name: "Dashboard",
    component: DashboardScreen,
    title: "Dashboard",
    headerShown: false
  },
  {
    name: "Settings",
    component: SettingsScreen,
    title: "Settings"
  },
  {
    name: "API Config",
    component: ApiSettingsScreen,
    title: "API field mapping"
  },
  {
    name: "Auth Settings",
    component: AuthSettingsScreen,
    title: "Authentication"
  },
  {
    name: "mTLS Settings",
    component: MtlsSettingsScreen,
    title: "Client certificate"
  },
  {
    name: "Geofences",
    component: GeofenceScreen,
    title: "Geofences"
  },
  {
    name: "Geofence Editor",
    component: GeofenceEditorScreen,
    title: "Geofence Editor"
  },
  {
    name: "Location History",
    component: LocationHistoryScreen,
    title: "Location History"
  },
  {
    name: "Location Summary",
    component: LocationSummaryScreen,
    title: "Summary"
  },
  {
    name: "Export Locations",
    component: ExportLocationsScreen,
    title: "Export Locations"
  },
  {
    name: "Import Locations",
    component: ImportLocationsScreen,
    title: "Import Locations"
  },
  {
    name: "Auto-Export",
    component: AutoExportScreen,
    title: "Auto-Export"
  },
  {
    name: "Data Management",
    component: DataManagementScreen,
    title: "Data Management"
  },
  {
    name: "Tracking Profiles",
    component: TrackingProfilesScreen,
    title: "Tracking Profiles"
  },
  {
    name: "Profile Editor",
    component: ProfileEditorScreen,
    title: "Profile Editor"
  },
  {
    name: "About Colota",
    component: AboutScreen,
    title: "About Colota"
  },
  {
    name: "Setup Import",
    component: SetupImportScreen,
    title: "Import Configuration"
  },
  {
    name: "Share Setup",
    component: ShareSetupScreen,
    title: "Share Setup"
  },
  {
    name: "Trip Detail",
    component: TripDetailScreen,
    title: "Trip Detail"
  },
  {
    name: "Offline Maps",
    component: OfflineMapsScreen,
    title: "Offline Maps"
  },
  {
    name: "Logging",
    component: ActivityLogScreen,
    title: "Logging"
  },
  {
    name: "Backup & Restore",
    component: BackupRestoreScreen,
    title: "Backup & Restore"
  },
  {
    name: "Appearance",
    component: AppearanceScreen,
    title: "Appearance"
  },
  {
    name: "Connection",
    component: ConnectionScreen,
    title: "Connection"
  },
  {
    name: "Tracking & Sync",
    component: TrackingSyncScreen,
    title: "Tracking & Sync"
  }
]

const TAB_SCREEN_NAMES = new Set(["Dashboard", "Location History", "Geofences", "Settings"])

function AppNavigator() {
  const { colors, isDark } = useTheme()
  const [currentRoute, setCurrentRoute] = useState<string | undefined>("Dashboard")
  const screenOptions = useMemo(
    () => ({
      headerStyle: {
        backgroundColor: colors.background
      },
      headerShadowVisible: false,
      headerTintColor: colors.text,
      headerTitleStyle: {
        ...text.title,
        color: colors.text
      },
      headerTitleAlign: "left" as const,
      headerBackTitleVisible: false,
      ...(Platform.OS === "android" && {
        animation: "slide_from_right" as const
      })
    }),
    [colors]
  )
  const statusBarConfig = useMemo(
    () => ({
      barStyle: isDark ? ("light-content" as const) : ("dark-content" as const),
      animated: true
    }),
    [isDark]
  )
  const linking = useMemo(
    () => ({
      prefixes: ["colota://"],
      config: {
        screens: {
          "Setup Import": "setup"
        }
      }
    }),
    []
  )

  const navigationRef = React.useRef<NavigationContainerRef<Record<string, undefined>>>(null)

  const handleStateChange = useCallback(() => {
    const route = navigationRef.current?.getCurrentRoute()
    if (route) setCurrentRoute(route.name)
  }, [])

  const handleTabNavigate = useCallback((route: string) => {
    const nav = navigationRef.current
    if (!nav) return
    const current = nav.getCurrentRoute()?.name
    if (current === route) return
    nav.navigate(route as never)
  }, [])

  return (
    <>
      <StatusBar {...statusBarConfig} />
      <NavigationContainer linking={linking} ref={navigationRef} onStateChange={handleStateChange}>
        <View style={styles.flex}>
          <Stack.Navigator initialRouteName="Dashboard" screenOptions={screenOptions}>
            {SCREEN_CONFIG.map((screen) => (
              <Stack.Screen
                key={screen.name}
                name={screen.name}
                component={screen.component}
                options={{
                  headerTitle: screen.title,
                  ...(screen.headerShown === false && { headerShown: false }),
                  ...(TAB_SCREEN_NAMES.has(screen.name) && { headerBackVisible: false })
                }}
              />
            ))}
          </Stack.Navigator>
          <BottomTabBar currentRoute={currentRoute} onNavigate={handleTabNavigate} />
        </View>
      </NavigationContainer>
    </>
  )
}

export default function App() {
  // Outermost on purpose: TrackingProvider mounts the dialogs, and the sheet they render
  // pads itself with the bottom inset, so the provider has to sit above them.
  return (
    <SafeAreaProvider>
      <LucideProvider strokeWidth={ICON_STROKE_WIDTH} absoluteStrokeWidth>
        <ThemeProvider>
          <ErrorBoundary>
            <TrackingProvider>
              <AppNavigator />
            </TrackingProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </LucideProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
