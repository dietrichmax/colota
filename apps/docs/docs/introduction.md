---
title: "Introduction"
description: "Features, screenshots, architecture and license"
---

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
- **Tracking profiles** - Automatically adjust GPS interval, distance filter and sync settings based on conditions like charging, Android Auto, Wi-Fi, a Bluetooth device, speed or stationary detection.
- **Flexible Sync** - Instant, batch, Wi-Fi only or offline modes.
- **Display Settings** - Choose between metric and imperial units, 12h or 24h time format. Auto-detected from device locale on first use.
- **App Shortcuts** - Long-press the app icon to start or stop tracking from the home screen. Compatible with automation apps like Tasker and Samsung Routines.
- **Quick Setup** - Configure devices via `colota://setup` deep links or QR codes.
- **Authentication** - Basic auth, bearer token or custom headers. Optional mutual TLS (mTLS) with a PKCS12 client certificate stored in Android Keystore.
- **Dark Mode** - Full light and dark theme support, optionally coloured from the Android wallpaper.
- **Languages** - English, Spanish and Simplified Chinese. [Help translate](/docs/development/translations).

## Screenshots

{{< screenshots "Dashboard|Dashboard" "Settings|Settings" "ApiFieldMapping|Request format" "Authentication|Authentication" "Geofences|Geofences" "GeofenceEditor|Geofence editor" "OfflineMaps|Offline maps" "TrackingProfiles|Tracking profiles" "ProfileEditor|Profile editor" "LocationHistory|Location history" "TripDetails|Trip detail" "Trips|Trips" "ExportData|Export & import" "AutoExport|Auto-export" "DataManagement|Data management" "DashboardDark|Dark mode|Light mode" >}}

## Architecture

Colota is a monorepo with a React Native UI layer and native Kotlin modules for background tracking:

- **apps/mobile** - React Native + Kotlin Android app
- **apps/docs** - This documentation site (Hugo)
- **packages/shared** - Shared theme colors, typography, corner radii, spacing, sizes, the `colota://setup` schema and the project's links

The native layer handles the foreground service, database, HTTP sync, geofencing, and credential storage. See the [Architecture](/docs/development/architecture) page for details.

## License

Colota is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). All modifications must remain open source.
