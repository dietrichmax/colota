---
sidebar_position: 1
slug: /introduction
---

# Introduction

Colota is a self-hosted GPS tracking app for Android. It sends your location to your own server over HTTP(S), works offline, supports geofencing, and has no analytics or telemetry.

## Key Features

- **Self-Hosted** - Send location data to your own server. Works with Dawarich, GeoPulse, Home Assistant, OwnTracks, Overland, PhoneTrack, Reitti, Traccar or any custom backend.
- **Privacy First** - No analytics, no telemetry, no third-party SDKs. Open source (AGPL-3.0).
- **Works Offline** - Fully functional without a server. Export as CSV, GeoJSON, GPX, or KML.
- **Offline maps** - Download map areas to your device for use without an internet connection.
- **Scheduled Export** - Automatic daily, weekly or monthly exports to a local directory with file retention management.
- **Encrypted Backup** - Single password-encrypted archive of locations, settings, geofences and credentials.
- **Location History** - View daily summaries, trip segmentation with manual merge and split, calendar with activity dots, per-trip export and per-point notes or deletion.
- **Import Your History** - Bring in existing tracks from GeoJSON, Google Timeline, GPX, KML or CSV.
- **Reliable Tracking** - Foreground service, auto-start on boot and exponential backoff retry.
- **Geofencing** - Pause zones that stop recording locations. Optionally stop GPS entirely when on WiFi or when the device is motionless.
- **Tracking profiles** - Automatically adjust GPS interval, distance filter and sync settings based on conditions like charging, Android Auto, speed or stationary detection.
- **Flexible Sync** - Instant, batch, Wi-Fi only or offline modes.
- **Display Settings** - Choose between metric and imperial units, 12h or 24h time format. Auto-detected from device locale on first use.
- **App Shortcuts** - Long-press the app icon to start or stop tracking from the home screen. Compatible with automation apps like Tasker and Samsung Routines.
- **Quick Setup** - Configure devices via `colota://setup` deep links or QR codes.
- **Authentication** - Basic auth, bearer token or custom headers. Optional mutual TLS (mTLS) with a PKCS12 client certificate stored in Android Keystore.
- **Dark Mode** - Full light and dark theme support, optionally coloured from the Android wallpaper.

## App Screens

Colota has twenty-eight screens, each focused on a specific task:

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Live map with current coordinates, today's track overlay, tracking controls, database stats, and geofence status |
| **Settings** | Hub linking to Connection, Tracking and Sync, Request format, Tracking profiles, Appearance and data/about screens |
| **Connection** | Server endpoint URL, offline mode toggle and connection test |
| **Tracking & sync** | GPS polling interval, distance filter, accuracy threshold and sync strategy preset |
| **Appearance** | Light/dark theme, wallpaper colors, unit system, time format and custom map tile URLs |
| **Request format** | How the request is shaped: the backend template, the HTTP method, the field names and any custom fields |
| **Backend template** | Pick the backend Colota formats its payload for, each option describing what it sends |
| **Authentication** | Endpoint authentication (None, Basic auth, Bearer token) and custom HTTP headers |
| **Client certificate** | Client certificate from the device store or a .p12, and the trusted server CA |
| **Geofences** | Create pause zones by tapping the map, view all zones with pause option indicators |
| **Geofence Editor** | Configure a zone: name, radius, record pause, WiFi pause, motionless pause and timeout, stationary heartbeat |
| **Place zone** | Pick a zone's centre on a map with its radius drawn live, handing it back to the editor |
| **Offline maps** | Download map areas to the device for use without an internet connection |
| **Tracking profiles** | Create and manage condition-based profiles that automatically adjust tracking settings |
| **Profile Editor** | Configure profile name, condition trigger, GPS interval, distance filter, sync interval, priority, and deactivation delay |
| **Location History** | Browse recorded locations on a track map with calendar day picker and trip-colored segments, view segmented trips with per-trip stats; tap a point to add a note or delete it |
| **Trip Detail** | Full trip view with dedicated map, stat rows (distance, duration, avg speed, elevation), speed and elevation profile charts, export and delete |
| **Location Summary** | Distance, trips, active days and average per day for a week or a month, stepped with chevrons, with each day opening in Location History |
| **Export locations** | Export tracked locations as CSV, GeoJSON, GPX, or KML |
| **Import locations** | Import tracks from GeoJSON, Google Timeline, GPX, KML or CSV with a preview before committing |
| **Auto-export** | Configure scheduled exports: directory, format, frequency, time of day (with weekday or day-of-month for weekly/monthly), export range and file retention |
| **Data management** | Clear sent history, delete old data, vacuum the database |
| **Backup & restore** | Create or restore a single password-encrypted `.colota` archive of all data (locations, settings, geofences, credentials) |
| **Setup Import** | Confirmation screen for deep link configuration imports (`colota://setup`) |
| **Share setup** | Build a `colota://setup` link or QR code from selected settings to configure another device |
| **Logging** | In-app activity log viewer (level filtering, search, export) plus opt-in persistent file logging |
| **About** | App version, device info, links to repository and privacy policy |
| **Legal** | Privacy policy, licence, source link and map attribution |

## Screenshots

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Dashboard.png", label: "Dashboard" }, { src: "/img/screenshots/Settings.png", label: "Settings" }, { src: "/img/screenshots/ApiFieldMapping.png", label: "Request format" }, { src: "/img/screenshots/Authentication.png", label: "Auth Settings" }, { src: "/img/screenshots/Geofences.png", label: "Geofences" }, { src: "/img/screenshots/GeofenceEditor.png", label: "Geofence Editor" }, { src: "/img/screenshots/OfflineMaps.png", label: "Offline maps" }, { src: "/img/screenshots/TrackingProfiles.png", label: "Profile Editor" }, { src: "/img/screenshots/LocationHistory.png", label: "Location History" }, { src: "/img/screenshots/TripDetails.png", label: "Trip Detail" }, { src: "/img/screenshots/Trips.png", label: "Trips" }, { src: "/img/screenshots/ExportData.png", label: "Export" }, { src: "/img/screenshots/AutoExport.png", label: "Auto-export" }, { src: "/img/screenshots/DataManagement.png", label: "Data management" }, { src: "/img/screenshots/DarkMode.png", label: "Dark Mode" }, ]} />

## Architecture

Colota is a monorepo with a React Native UI layer and native Kotlin modules for background tracking:

- **apps/mobile** - React Native + Kotlin Android app
- **apps/docs** - This documentation site (Docusaurus)
- **packages/shared** - Shared theme colors, typography, and types

The native layer handles the foreground service, database, HTTP sync, geofencing, and credential storage. See the [Architecture](/docs/development/architecture) page for details.

## License

Colota is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). All modifications must remain open source.
