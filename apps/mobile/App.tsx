/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { useMemo, useState, useCallback } from "react"
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native"
import { LucideProvider } from "lucide-react-native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { View, StatusBar, Platform, StyleSheet } from "react-native"
import { ThemeProvider, useTheme } from "./src/hooks/useTheme"
import { fonts } from "./src/styles/typography"
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
import { BottomTabBar, TAB_ROUTES } from "./src/components"
import { loadDisplayPreferences } from "./src/utils/geo"
import { registerTileServerUserAgent } from "./src/utils/tileHeaders"

// Load display preferences early
loadDisplayPreferences()

registerTileServerUserAgent()

const Stack = createNativeStackNavigator<RootStackParamList>()

type ScreenConfig = { name: RootStackRoute; component: React.ComponentType<any>; title: string }

const SCREEN_CONFIG: readonly ScreenConfig[] = [
  {
    name: "Dashboard",
    component: DashboardScreen,
    title: "Dashboard"
  },
  {
    name: "Settings",
    component: SettingsScreen,
    title: "Settings"
  },
  {
    name: "API Config",
    component: ApiSettingsScreen,
    title: "API config"
  },
  {
    name: "Auth Settings",
    component: AuthSettingsScreen,
    title: "Auth settings"
  },
  {
    name: "mTLS Settings",
    component: MtlsSettingsScreen,
    title: "mTLS settings"
  },
  {
    name: "Geofences",
    component: GeofenceScreen,
    title: "Geofences"
  },
  {
    name: "Geofence Editor",
    component: GeofenceEditorScreen,
    title: "Geofence editor"
  },
  {
    name: "Location History",
    component: LocationHistoryScreen,
    title: "Location history"
  },
  {
    name: "Location Summary",
    component: LocationSummaryScreen,
    title: "Summary"
  },
  {
    name: "Export Locations",
    component: ExportLocationsScreen,
    title: "Export locations"
  },
  {
    name: "Import Locations",
    component: ImportLocationsScreen,
    title: "Import locations"
  },
  {
    name: "Auto-Export",
    component: AutoExportScreen,
    title: "Auto-export"
  },
  {
    name: "Data Management",
    component: DataManagementScreen,
    title: "Data management"
  },
  {
    name: "Tracking Profiles",
    component: TrackingProfilesScreen,
    title: "Tracking profiles"
  },
  {
    name: "Profile Editor",
    component: ProfileEditorScreen,
    title: "Profile editor"
  },
  {
    name: "About Colota",
    component: AboutScreen,
    title: "About Colota"
  },
  {
    name: "Setup Import",
    component: SetupImportScreen,
    title: "Import configuration"
  },
  {
    name: "Share Setup",
    component: ShareSetupScreen,
    title: "Share setup"
  },
  {
    name: "Trip Detail",
    component: TripDetailScreen,
    title: "Trip detail"
  },
  {
    name: "Offline Maps",
    component: OfflineMapsScreen,
    title: "Offline maps"
  },
  {
    name: "Logging",
    component: ActivityLogScreen,
    title: "Logging"
  },
  {
    name: "Backup & Restore",
    component: BackupRestoreScreen,
    title: "Backup & restore"
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
    title: "Tracking & sync"
  }
]


function AppNavigator() {
  const { colors, isDark } = useTheme()
  const [currentRoute, setCurrentRoute] = useState<string | undefined>("Dashboard")
  const screenOptions = useMemo(
    () => ({
      headerStyle: {
        backgroundColor: colors.background,
        elevation: 0,
        shadowOpacity: 0
      },
      headerTintColor: colors.text,
      headerTitleStyle: {
        ...fonts.bold,
        fontSize: 18,
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
      backgroundColor: colors.background,
      translucent: false,
      animated: true
    }),
    [colors.background, isDark]
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
    <SafeAreaProvider>
      {/* One provider so a 16 badge and a 24 tab glyph carry the same painted weight. */}
      <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
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
                    ...(TAB_ROUTES.has(screen.name) && { headerBackVisible: false })
                  }}
                />
              ))}
            </Stack.Navigator>
            <BottomTabBar currentRoute={currentRoute} onNavigate={handleTabNavigate} />
          </View>
        </NavigationContainer>
      </LucideProvider>
    </SafeAreaProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <TrackingProvider>
          <AppNavigator />
        </TrackingProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
