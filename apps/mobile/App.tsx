/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { useMemo } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { StatusBar, Platform } from "react-native"
import { ThemeProvider, useTheme } from "./src/hooks/useTheme"
import { fonts } from "./src/styles/typography"
import { TrackingProvider } from "./src/contexts/TrackingProvider"
import { ErrorBoundary } from "./src/components/ui/ErrorBoundary"
import {
  DashboardScreen,
  SettingsScreen,
  ApiSettingsScreen,
  AuthSettingsScreen,
  GeofenceScreen,
  DataManagementScreen,
  LocationHistoryScreen,
  ExportDataScreen,
  AboutScreen,
  TrackingProfilesScreen,
  ProfileEditorScreen
} from "./src/screens/"

const Stack = createNativeStackNavigator()

const SCREEN_CONFIG = [
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
    title: "API Config"
  },
  {
    name: "Auth Settings",
    component: AuthSettingsScreen,
    title: "Auth Settings"
  },
  {
    name: "Geofences",
    component: GeofenceScreen,
    title: "Geofences"
  },
  {
    name: "Location History",
    component: LocationHistoryScreen,
    title: "Location History"
  },
  {
    name: "Export Data",
    component: ExportDataScreen,
    title: "Export Data"
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
  }
] as const

function AppNavigator() {
  const { colors, isDark } = useTheme()
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
  return (
    <SafeAreaProvider>
      <StatusBar {...statusBarConfig} />
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Dashboard" screenOptions={screenOptions}>
          {SCREEN_CONFIG.map((screen) => (
            <Stack.Screen
              key={screen.name}
              name={screen.name}
              component={screen.component}
              options={{ headerTitle: screen.title }}
            />
          ))}
        </Stack.Navigator>
      </NavigationContainer>
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
