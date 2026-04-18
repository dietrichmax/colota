---
sidebar_position: 1
slug: /introduction
---

# Introduction

Colota is a self-hosted GPS tracking app for Android. It sends your location to your own server over HTTP(S), works offline, supports geofencing, and has no analytics or telemetry.

## Key Features

- **Self-Hosted** - Send location data to your own server. Works with Dawarich, GeoPulse, OwnTracks, PhoneTrack, Reitti, Traccar, Home Assistant or any custom backend.
- **Privacy First** - No analytics, no telemetry, no third-party SDKs. Open source (AGPL-3.0).
- **Works Offline** - Fully functional without a server. Export as CSV, GeoJSON, GPX, or KML.
- **Offline Maps** - Download map areas to your device for use without an internet connection.
- **Scheduled Export** - Automatic daily, weekly or monthly exports to a local directory with file retention management.
- **Location History** - View daily summaries, trip segmentation, calendar with activity dots and per-trip export.
- **Reliable Tracking** - Foreground service, auto-start on boot and exponential backoff retry.
- **Geofencing** - Pause zones that stop recording locations. Optionally stop GPS entirely when on WiFi or when the device is motionless.
- **Tracking Profiles** - Automatically adjust GPS interval, distance filter and sync settings based on conditions like charging, Android Auto, speed or stationary detection.
- **Flexible Sync** - Instant, batch, Wi-Fi only or offline modes.
- **Display Settings** - Choose between metric and imperial units, 12h or 24h time format. Auto-detected from device locale on first use.
- **Quick Setup** - Configure devices via `colota://setup` deep links or QR codes.
- **Authentication** - Basic Auth, Bearer Token or custom headers with AES-256-GCM encryption.
- **Dark Mode** - Full light and dark theme support.

## App Screens

Colota has eighteen screens, each focused on a specific task:

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Live map with current coordinates, today's track overlay, tracking controls, database stats, and geofence status |
| **Settings** | GPS polling interval, distance filter, sync strategy, offline mode, accuracy threshold, unit system, time format |
| **API Config** | Endpoint field mapping with templates for Dawarich, OwnTracks, PhoneTrack, Reitti, Traccar, or custom backends |
| **Auth Settings** | Endpoint authentication (None, Basic Auth, Bearer Token) and custom HTTP headers |
| **Geofences** | Create pause zones by tapping the map, view all zones with pause option indicators |
| **Geofence Editor** | Configure pause options per zone: record pause, WiFi pause, motionless pause, stationary heartbeat and delete |
| **Offline Maps** | Download map areas to the device for use without an internet connection |
| **Tracking Profiles** | Create and manage condition-based profiles that automatically adjust tracking settings |
| **Profile Editor** | Configure profile name, condition trigger, GPS interval, distance filter, sync interval, priority, and deactivation delay |
| **Location History** | Browse recorded locations on a track map with calendar day picker and trip-colored segments, view segmented trips with per-trip stats |
| **Trip Detail** | Full trip view with dedicated map, stats grid (distance, duration, avg speed, elevation), speed and elevation profile charts, and export |
| **Location Summary** | Aggregated stats (total distance, trips, active days, avg distance) for selectable periods with daily breakdown and tap-to-inspect navigation |
| **Export Data** | Export tracked locations as CSV, GeoJSON, GPX, or KML |
| **Auto-Export** | Configure scheduled exports: format, directory, frequency, export range, and file retention |
| **Data Management** | Clear sent history, delete old data, vacuum the database |
| **Setup Import** | Confirmation screen for deep link configuration imports (`colota://setup`) |
| **Activity Log** | In-app log viewer with level filtering, search, and export for bug reports |
| **About** | App version, device info, links to repository and privacy policy |

## Screenshots

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Dashboard.png", label: "Dashboard" }, { src: "/img/screenshots/Settings.png", label: "Settings" }, { src: "/img/screenshots/ApiFieldMapping.png", label: "API Config" }, { src: "/img/screenshots/Authentication.png", label: "Auth Settings" }, { src: "/img/screenshots/Geofences.png", label: "Geofences" }, { src: "/img/screenshots/GeofenceEditor.png", label: "Geofence Editor" }, { src: "/img/screenshots/OfflineMaps.png", label: "Offline Maps" }, { src: "/img/screenshots/TrackingProfiles.png", label: "Profile Editor" }, { src: "/img/screenshots/LocationHistory.png", label: "Location History" }, { src: "/img/screenshots/TripDetails.png", label: "Trip Detail" }, { src: "/img/screenshots/Trips.png", label: "Trips" }, { src: "/img/screenshots/ExportData.png", label: "Export" }, { src: "/img/screenshots/AutoExport.png", label: "Auto-Export" }, { src: "/img/screenshots/DataManagement.png", label: "Data Management" }, { src: "/img/screenshots/DarkMode.png", label: "Dark Mode" }, ]} />

## Architecture

Colota is a monorepo with a React Native UI layer and native Kotlin modules for background tracking:

- **apps/mobile** - React Native + Kotlin Android app
- **apps/docs** - This documentation site (Docusaurus)
- **packages/shared** - Shared theme colors, typography, and types

The native layer handles the foreground service, database, HTTP sync, geofencing, and credential storage. See the [Architecture](/docs/development/architecture) page for details.

## License

Colota is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). All modifications must remain open source.
