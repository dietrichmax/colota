/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { useMemo, useState, useCallback, useEffect } from "react"
import { NavigationContainer, NavigationContainerRef, DefaultTheme, DarkTheme } from "@react-navigation/native"
import { LucideProvider } from "lucide-react-native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { View, StatusBar, Platform, StyleSheet, AppState } from "react-native"
import { ThemeProvider, useTheme } from "./src/hooks/useTheme"
import { fonts } from "./src/styles/typography"
import { TrackingProvider } from "./src/contexts/TrackingProvider"
import { ErrorBoundary } from "./src/components/ui/ErrorBoundary"
import type { RootStackParamList, RootStackRoute } from "./src/types/navigation"

import "./src/i18n"
import { useTranslation } from "./src/i18n/useTranslation"
import { syncLanguage } from "./src/i18n/language"
import type { TranslationKey } from "./src/i18n/options"
import {
  LoggingScreen,
  LogPreviewScreen,
  DashboardScreen,
  SettingsScreen,
  ApiSettingsScreen,
  BackendTemplateScreen,
  AuthSettingsScreen,
  MtlsSettingsScreen,
  AutoExportScreen,
  GeofenceScreen,
  GeofenceEditorScreen,
  PlaceZoneScreen,
  DataManagementScreen,
  LocationHistoryScreen,
  LocationSummaryScreen,
  ExportImportScreen,
  AboutScreen,
  TrackingProfilesScreen,
  ProfileEditorScreen,
  SetupImportScreen,
  ShareSetupScreen,
  TripDetailScreen,
  OfflineMapsScreen,
  AppearanceScreen,
  LanguageScreen,
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

type ScreenConfig = { name: RootStackRoute; component: React.ComponentType<any>; titleKey: TranslationKey }

const SCREEN_CONFIG: readonly ScreenConfig[] = [
  {
    name: "Dashboard",
    component: DashboardScreen,
    titleKey: "screen.dashboard"
  },
  {
    name: "Settings",
    component: SettingsScreen,
    titleKey: "screen.settings"
  },
  {
    name: "Request Format",
    component: ApiSettingsScreen,
    titleKey: "screen.requestFormat"
  },
  {
    name: "Backend Template",
    component: BackendTemplateScreen,
    titleKey: "screen.backendTemplate"
  },
  {
    name: "Auth Settings",
    component: AuthSettingsScreen,
    titleKey: "screen.authSettings"
  },
  {
    name: "mTLS Settings",
    component: MtlsSettingsScreen,
    titleKey: "screen.mtlsSettings"
  },
  {
    name: "Geofences",
    component: GeofenceScreen,
    titleKey: "screen.geofences"
  },
  {
    name: "Geofence Editor",
    component: GeofenceEditorScreen,
    titleKey: "screen.geofenceEditor"
  },
  {
    name: "Place Zone",
    component: PlaceZoneScreen,
    titleKey: "screen.placeZone"
  },
  {
    name: "Location History",
    component: LocationHistoryScreen,
    titleKey: "screen.locationHistory"
  },
  {
    name: "Location Summary",
    component: LocationSummaryScreen,
    titleKey: "screen.locationSummary"
  },
  {
    name: "Export & Import",
    component: ExportImportScreen,
    titleKey: "screen.exportImport"
  },
  {
    name: "Auto-Export",
    component: AutoExportScreen,
    titleKey: "screen.autoExport"
  },
  {
    name: "Data Management",
    component: DataManagementScreen,
    titleKey: "screen.dataManagement"
  },
  {
    name: "Tracking Profiles",
    component: TrackingProfilesScreen,
    titleKey: "screen.trackingProfiles"
  },
  {
    name: "Profile Editor",
    component: ProfileEditorScreen,
    titleKey: "screen.profileEditor"
  },
  {
    name: "About Colota",
    component: AboutScreen,
    titleKey: "screen.aboutColota"
  },
  {
    name: "Setup Import",
    component: SetupImportScreen,
    titleKey: "screen.setupImport"
  },
  {
    name: "Share Setup",
    component: ShareSetupScreen,
    titleKey: "screen.shareSetup"
  },
  {
    name: "Trip Detail",
    component: TripDetailScreen,
    titleKey: "screen.tripDetail"
  },
  {
    name: "Offline Maps",
    component: OfflineMapsScreen,
    titleKey: "screen.offlineMaps"
  },
  {
    name: "Logging",
    component: LoggingScreen,
    titleKey: "screen.logging"
  },
  {
    name: "Log Preview",
    component: LogPreviewScreen,
    titleKey: "screen.logPreview"
  },
  {
    name: "Backup & Restore",
    component: BackupRestoreScreen,
    titleKey: "screen.backupRestore"
  },
  {
    name: "Appearance",
    component: AppearanceScreen,
    titleKey: "screen.appearance"
  },
  {
    name: "Language",
    component: LanguageScreen,
    titleKey: "screen.language"
  },
  {
    name: "Connection",
    component: ConnectionScreen,
    titleKey: "screen.connection"
  },
  {
    name: "Tracking & Sync",
    component: TrackingSyncScreen,
    titleKey: "screen.trackingSync"
  }
]

function AppNavigator() {
  const { colors, isDark } = useTheme()
  const { t } = useTranslation()
  const [currentRoute, setCurrentRoute] = useState<string | undefined>("Dashboard")

  // Android's own App languages page and a phone-language change never pass through the picker.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncLanguage()
    })
    return () => sub.remove()
  }, [])
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
      contentStyle: { backgroundColor: colors.background },
      headerBackTitleVisible: false,
      ...(Platform.OS === "android" && {
        animation: "slide_from_right" as const
      })
    }),
    [colors]
  )
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        primary: colors.primary
      }
    }
  }, [colors, isDark])
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
        <NavigationContainer
          theme={navigationTheme}
          linking={linking}
          ref={navigationRef}
          onStateChange={handleStateChange}
        >
          <View style={styles.flex}>
            <Stack.Navigator initialRouteName="Dashboard" screenOptions={screenOptions}>
              {SCREEN_CONFIG.map((screen) => (
                <Stack.Screen
                  key={screen.name}
                  name={screen.name}
                  component={screen.component}
                  options={{
                    headerTitle: t(screen.titleKey),
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
