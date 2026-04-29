---
title: Privacy Policy
---

# Privacy Policy

**Last updated: April 29, 2026**

Colota ("the App") is a self-hosted GPS tracking application for Android, developed by Max Dietrich. This privacy policy explains what data the App collects, how it is used, and your rights regarding that data.

## Data Collection

### Location Data

The App collects the following location-related data when tracking is active:

- GPS coordinates (latitude, longitude)
- Altitude
- Speed
- Bearing (direction)
- Accuracy
- Timestamp

### Device Data

The App also collects:

- Battery level (0-100%)
- Battery status (charging, unplugged, full)

### Geofence Data

If you create pause zones (geofences), the App stores zone names, coordinates, radii and per-zone settings (enabled state, tracking pause, WiFi pause, motionless pause, motionless timeout, heartbeat enabled, heartbeat interval and entry/exit notifications) in the local database.

### Condition Monitoring

When tracking profiles are enabled, the App monitors charging state, car mode (Android Auto) and GPS speed derived from location updates to automatically switch tracking configurations. These condition states are transient and are not stored in the database. The name of the currently active pause zone is persisted across service restarts to maintain continuity but is cleared when the zone is exited.

### Sensor Data

When motionless pause is enabled for a geofence zone, the App uses the device's significant motion sensor to detect motion. This data is processed in real time and is never stored or transmitted.

### Network State

When WiFi pause is enabled for a geofence zone, the App monitors whether the device is connected to an unmetered network (WiFi or Ethernet). Only the connection type is checked - no network names, SSIDs or IP addresses are collected or stored.

All data is stored **locally on your device** and is never sent anywhere unless you configure a server. The App does not collect personal identifiers, advertising IDs, device identifiers (IMEI, serial number), usage analytics, telemetry, or crash reports.

## Data Storage

Collected data is stored in a local SQLite database on your device. The data is not accessible to other apps. The App checks available device storage before downloading offline map packs.

If you configure auto-export, the App will write export files (CSV, GeoJSON, GPX, or KML) to a directory you select on your device. No data leaves your device as part of this process.

Authentication credentials (if configured) are encrypted using **AES-256-GCM** via Android's `EncryptedSharedPreferences`.

The App supports configuration via `colota://setup` deep links. These links can include server endpoints and authentication credentials. You must explicitly confirm before any configuration is applied. Only open setup links from sources you trust.

## Data Transmission

The App **only transmits data to a server endpoint that you configure**. No data is sent anywhere by default.

- Data is sent via HTTPS (HTTP is only allowed for local/private network addresses). Self-signed TLS certificates are supported by installing your CA certificate on the device via Android system settings
- When a server is configured, the App may send health check requests to backend-specific endpoints to verify connectivity. These requests go only to your own server
- No analytics, tracking pixels, or advertising networks are used
- No data is shared with the developer, advertisers or analytics providers

## Data Sharing

Colota does not share your data with anyone. The only data transmission occurs to your own self-hosted server, if you choose to configure one.

## Third-Party Services

### Google Play

The GMS variant of the App is distributed via Google Play, which may collect data according to [Google's Privacy Policy](https://policies.google.com/privacy). This is outside the App's control. The FOSS variant is available on F-Droid, IzzyOnDroid and GitHub Releases with no Google dependency.

### Map Tiles (maps.mxd.codes)

The App displays maps using a self-hosted tile server at [maps.mxd.codes](https://maps.mxd.codes), operated by the developer on a VPS provided by [netcup](https://www.netcup.de). No CDN, proxy or other external service (e.g. Cloudflare) sits in front of the server. When the map is visible or offline map packs are downloaded, your device makes requests to this server to fetch vector tiles. Downloaded tiles are cached in the app's local database for offline use. Access logging is disabled for all requests by default. Logging may be enabled temporarily to investigate abuse or operational issues. No cookies or tracking are used. A custom tile server URL can be configured in Settings. See the [tile server guide](/docs/guides/tile-server) for more details.

### No Other Third Parties

The App contains no third-party SDKs, analytics tools, advertising frameworks, or cloud services.

## Data Retention

Location data remains on your device until you delete it. You can:

- Export data in CSV, GeoJSON, GPX, or KML format
- Delete sent history
- Delete data older than a specified number of days
- Clear all data from the database

## Your Rights

Since all data is stored locally on your device, you have full control:

- **Access**: View all data in the app's Data Management screen
- **Export**: Export your data at any time in multiple formats
- **Delete**: Delete any or all data at any time
- **Portability**: Export and transfer your data freely

## Permissions

| Permission                        | Purpose                                                |
| --------------------------------- | ------------------------------------------------------ |
| Location (Precise)                | GPS tracking                                           |
| Location (Approximate)            | Required alongside precise location on Android         |
| Background Location (Android 10+) | Tracking while the app is not in the foreground        |
| Foreground Service                | Background tracking with notification                  |
| Foreground Service (Location)     | Location access while tracking in the background       |
| Foreground Service (Data Sync)    | Auto-export background processing                      |
| Notification (Android 13+)        | Foreground service notification                        |
| Boot Completed                    | Auto-start tracking after device reboot                |
| Internet                          | Server sync and map tile loading                       |
| Network State                     | Sync condition checks and WiFi pause in geofence zones |
| Wi-Fi State                       | SSID detection for sync condition filtering            |
| Local Network (Android 17+)       | Required for sync to servers on the local network      |
| Battery Optimization Exemption    | Optional, prevents system from restricting the app     |

## Children's Privacy

The App is not directed at children under 13. We do not knowingly collect data from children.

## Open Source

Colota is open source under the [AGPL-3.0 license](https://github.com/dietrichmax/colota). You can review the complete source code to verify these privacy practices.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted on this page with an updated revision date.

## Contact

For questions about this privacy policy, write to [colota@mxd.codes](mailto:colota@mxd.codes) or open an [issue on GitHub](https://github.com/dietrichmax/colota/issues).
