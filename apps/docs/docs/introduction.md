---
sidebar_position: 1
slug: /introduction
---

# Introduction

Colota is a self-hosted GPS tracking app for Android. It sends your location to your own server over HTTP(S), works offline, supports geofencing, and doesn't share any data except with your configured backends.

## Key Features

- **Self-Hosted** — Send location data to your own server via REST API. Works with Dawarich, OwnTracks, PhoneTrack, Reitti, Traccar, or any custom backend.
- **Privacy First** — No analytics, no telemetry, no third-party SDKs, no cloud services. Open source under AGPL-3.0.
- **Works Offline** — Works without a server. Store location history locally and export as CSV, GeoJSON, GPX, or KML.
- **Background Tracking** — Foreground service, auto-start on boot, retry with exponential backoff, battery-critical shutdown.
- **Geofencing** — Create pause zones where tracking automatically pauses to save battery.
- **Sync Modes** — Instant, batch, or offline. Wi-Fi only sync, configurable intervals with automatic retry.
- **Data Export** — Export location history in CSV, GeoJSON, GPX, or KML formats.
- **Authentication** — Basic Auth, Bearer Token, or custom HTTP headers with AES-256-GCM encrypted storage.
- **Dark Mode** — Full light and dark theme support.

## App Screens

Colota has nine screens, each focused on a specific task:

| Screen | Purpose |
| --- | --- |
| **Dashboard** | Live map with current coordinates, tracking controls, database stats, and geofence status |
| **Settings** | GPS polling interval, distance filter, sync strategy, offline mode, accuracy threshold |
| **API Config** | Endpoint field mapping with templates for Dawarich, OwnTracks, PhoneTrack, Reitti, Traccar, or custom backends |
| **Auth Settings** | Endpoint authentication (None, Basic Auth, Bearer Token) and custom HTTP headers |
| **Geofences** | Create, edit, and delete pause zones on an interactive map |
| **Location History** | Browse recorded locations on a track map with day picker and daily distance traveled, or as a paginated list with accuracy indicators |
| **Export Data** | Export tracked locations as CSV, GeoJSON, GPX, or KML |
| **Data Management** | Clear sent history, delete old data, vacuum the database |
| **About** | App version, device info, links to repository and privacy policy |

## Screenshots

<div className="screenshot-gallery">
  <figure>
    <img src="/img/screenshots/Dashboard.png" alt="Dashboard" />
    <figcaption>Dashboard</figcaption>
  </figure>
  <figure>
    <img src="/img/screenshots/Settings.png" alt="Settings" />
    <figcaption>Settings</figcaption>
  </figure>
  <figure>
    <img src="/img/screenshots/Geofences.png" alt="Geofences" />
    <figcaption>Geofences</figcaption>
  </figure>
  <figure>
    <img src="/img/screenshots/DataManagement.png" alt="Data Management" />
    <figcaption>Data Management</figcaption>
  </figure>
</div>

## Architecture

Colota is a monorepo with a React Native UI layer and native Kotlin modules for background tracking:

- **apps/mobile** — React Native + Kotlin Android app
- **apps/docs** — This documentation site (Docusaurus)
- **packages/shared** — Shared theme colors, typography, and types

The native layer handles the foreground service, database, HTTP sync, geofencing, and credential storage. See the [Architecture](/docs/development/architecture) page for details.

## License

Colota is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). All modifications must remain open source.
