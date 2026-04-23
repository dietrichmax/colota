/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { Trip } from "./global"

type InspectorTab = "map" | "trips" | "data"

export type RootStackParamList = {
  Dashboard: undefined
  Settings: undefined
  Connection: undefined
  "Tracking & Sync": undefined
  Appearance: undefined
  "API Config": undefined
  "Auth Settings": undefined
  Geofences: undefined
  "Geofence Editor": { geofenceId?: number; name?: string; radius?: number; lat?: number; lon?: number } | undefined
  "Location History": { initialTab?: InspectorTab; initialDate?: string } | undefined
  "Location Summary": undefined
  "Export Data": undefined
  "Auto-Export": undefined
  "Data Management": undefined
  "Tracking Profiles": undefined
  "Profile Editor": { profileId?: number } | undefined
  "About Colota": undefined
  "Setup Import": undefined
  "Trip Detail": { trip: Trip }
  "Offline Maps": undefined
  "Activity Log": undefined
}

export type RootStackRoute = keyof RootStackParamList

export type RootScreenProps<Route extends RootStackRoute> = NativeStackScreenProps<RootStackParamList, Route>

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
