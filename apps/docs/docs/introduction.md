---
sidebar_position: 1
slug: /introduction
---

# Introduction

Colota is a self-hosted GPS tracking app for Android. It sends your location to your own server over HTTP(S), works offline, supports geofencing, and doesn't share any data except with your configured backends.

## Key Features

- **Self-Hosted** - Send location data to your own server via REST API. Works with Dawarich, OwnTracks, PhoneTrack, Reitti, Traccar, or any custom backend.
- **Privacy First** - No analytics, no telemetry, no third-party SDKs, no cloud services. Open source under AGPL-3.0.
- **Works Offline** - Works without a server. Store location history locally and export as CSV, GeoJSON, GPX, or KML.
- **Background Tracking** - Foreground service, auto-start on boot, retry with exponential backoff, battery-critical shutdown.
- **Geofencing** - Create pause zones where location recording automatically stops.
- **Tracking Profiles** - Automatically switch GPS interval, distance filter, and sync settings based on conditions like charging, car mode, or speed thresholds.
- **Sync Modes** - Instant, batch, or offline. Wi-Fi only sync, configurable intervals with automatic retry.
- **Data Export** - Export location history in CSV, GeoJSON, GPX, or KML formats.
- **Authentication** - Basic Auth, Bearer Token, or custom HTTP headers with AES-256-GCM encrypted storage.
- **Quick Setup** - Configure devices instantly via `colota://setup` deep links or QR codes. No manual typing required.
- **Dark Mode** - Full light and dark theme support.

## App Screens

Colota has fourteen screens, each focused on a specific task:

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Live map with current coordinates, tracking controls, database stats, and geofence status |
| **Settings** | GPS polling interval, distance filter, sync strategy, offline mode, accuracy threshold |
| **API Config** | Endpoint field mapping with templates for Dawarich, OwnTracks, PhoneTrack, Reitti, Traccar, or custom backends |
| **Auth Settings** | Endpoint authentication (None, Basic Auth, Bearer Token) and custom HTTP headers |
| **Geofences** | Create, edit, and delete pause zones on an interactive map |
| **Tracking Profiles** | Create and manage condition-based profiles that automatically adjust tracking settings |
| **Profile Editor** | Configure profile name, condition trigger, GPS interval, distance filter, sync interval, priority, and deactivation delay |
| **Location History** | Browse recorded locations on a track map with calendar day picker and trip-colored segments, view segmented trips with per-trip stats |
| **Trip Detail** | Full trip view with dedicated map, stats grid (distance, duration, avg speed, elevation), speed and elevation profile charts, and export |
| **Location Summary** | Aggregated stats (total distance, trips, active days, avg distance) for selectable periods with daily breakdown and tap-to-inspect navigation |
| **Export Data** | Export tracked locations as CSV, GeoJSON, GPX, or KML |
| **Data Management** | Clear sent history, delete old data, vacuum the database |
| **Setup Import** | Confirmation screen for deep link configuration imports (`colota://setup`) |
| **About** | App version, device info, links to repository and privacy policy |

## Screenshots

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Dashboard.png", label: "Dashboard" }, { src: "/img/screenshots/LocationHistory.png", label: "Location History" }, { src: "/img/screenshots/TripDetails.png", label: "Trip Detail" }, { src: "/img/screenshots/Trips.png", label: "Trips" }, { src: "/img/screenshots/Settings.png", label: "Settings" }, { src: "/img/screenshots/TrackingProfiles.png", label: "Tracking Profiles" }, { src: "/img/screenshots/DataManagement.png", label: "Data Management" }, { src: "/img/screenshots/ApiFieldMapping.png", label: "API Field Mapping" }, { src: "/img/screenshots/ExportData.png", label: "Export" }, { src: "/img/screenshots/Authentication.png", label: "Authentication" }, { src: "/img/screenshots/DarkMode.png", label: "Dark Mode" }, ]} />

## Architecture

Colota is a monorepo with a React Native UI layer and native Kotlin modules for background tracking:

- **apps/mobile** - React Native + Kotlin Android app
- **apps/docs** - This documentation site (Docusaurus)
- **packages/shared** - Shared theme colors, typography, and types

The native layer handles the foreground service, database, HTTP sync, geofencing, and credential storage. See the [Architecture](/docs/development/architecture) page for details.

## License

Colota is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). All modifications must remain open source.
