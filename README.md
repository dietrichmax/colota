# Colota

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0) ![Version](https://img.shields.io/github/v/release/dietrichmax/colota) [![Android](https://img.shields.io/badge/Platform-Android-green.svg)](https://developer.android.com) [![React Native](https://img.shields.io/badge/React_Native-0.83-blue.svg)](https://reactnative.dev) [![Shield: Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-Support-yellow?logo=buymeacoffee)](https://ko-fi.com/maxdietrich)

**Self-hosted GPS tracking app for Android.**

Colota sends your location to your own server over HTTP(S). It works offline, supports geofencing, and doesn't share any data except with your backends.

[Download on Google Play](https://play.google.com/store/apps/details?id=com.Colota&hl=en-US) | [View Screenshots](#screenshots) | [Documentation](#documentation)

---

## Features

### Self-Hosted

- Optional REST API connection to your own server
- Works completely offline without any server
- HTTPS-encrypted data transmission (HTTP allowed for localhost)
- Built-in API templates for Dawarich, OwnTracks, and Reitti
- Works with any backend that accepts JSON over HTTP (Home Assistant, Traccar, NodeRED, etc.)

### GPS Tracking

- HIGH_ACCURACY positioning mode
- Configurable intervals (1 second to hours)
- Records: coordinates, accuracy, altitude, speed, bearing, battery status
- Accuracy filter for invalid GPS fixes
- Movement threshold — only record if moved X meters
- Foreground service for reliable background tracking
- Retry logic with exponential backoff

### Geofencing

- Unlimited geofence zones (silent zones)
- Automatic tracking pause in defined areas
- Adjustable radius per zone
- GPS pause in zones saves battery

### Sync Modes

- **Instant:** Send each position immediately
- **Batch:** Batch transmission (1/5/15 minutes)
- **Offline:** Pure local storage, no network
- Retry with backoff on failure (30s, 60s, 5min, 15min)
- Auto-sync when network becomes available
- Automatic cleanup of permanently failed items

### Data Export

- Export location history in CSV, GeoJSON, GPX, or KML
- Share exported files directly from the app

### Authentication

- Basic Auth, Bearer Token, or no auth
- Custom HTTP headers for proxies and access control
- AES-256-GCM encrypted credential storage on device

### Reliability

- Auto-start on boot resumes tracking after restart
- Battery critical monitoring stops tracking below 5% when unplugged
- Server health check with 3-stage fallback
- Persistent foreground service survives app restarts

### Privacy

- Open source (AGPL-3.0)
- No telemetry, analytics, or third-party SDKs
- HTTPS-only server communication (except localhost)
- Data stays on your device or your server

## Screenshots

**Light Mode**

<table>
  <tr>
    <td><img src="https://github.com/dietrichmax/colota/blob/main/screenshots/mobile/original/Dashboard.png" alt="Dashboard" width="200"/></td>
    <td><img src="https://github.com/dietrichmax/colota/blob/main/screenshots/mobile/original/Geofences.png" alt="Geofences" width="200"/></td>
    <td><img src="https://github.com/dietrichmax/colota/blob/main/screenshots/mobile/original/Settings.png" alt="Settings" width="200"/></td>
    <td><img src="https://github.com/dietrichmax/colota/blob/main/screenshots/mobile/original/DataManagement.png" alt="Database" width="200"/></td>
  </tr>
  <tr>
    <td align="center">Dashboard</td>
    <td align="center">Geofences</td>
    <td align="center">Settings</td>
    <td align="center">Database</td>
  </tr>
</table>

## Installation

### From Google Play

[<img src="https://play.google.com/intl/en_us/badges/images/generic/en_badge_web_generic.png" alt="Get it on Google Play" height="80">](https://play.google.com/store/apps/details?id=com.Colota&hl=en-US)

### From Releases

1. Download the latest APK from [Releases](https://github.com/dietrichmax/colota/releases)
2. Enable "Install from Unknown Sources" in Android settings
3. Install the APK

### Build from Source

> **Requirements:** Node.js >= 20, Android SDK, JDK 17+

```bash
git clone https://github.com/dietrichmax/colota.git
cd colota
npm install
cd android
./gradlew assembleRelease
```

APK will be in `android/app/build/outputs/apk/release/`

---

## Quick Start

1. Install the app
2. Grant location permissions (**precise location**)
3. Disable battery optimization for Colota
4. Press **Start Tracking**
5. View live coordinates on dashboard

The app works completely offline. Server setup is optional.

---

## Server Setup

### API Templates

Colota includes built-in templates for popular backends. Select a template in **Settings > API Settings** to auto-configure field mappings.

| Template      | Bearing Field | Custom Fields                    | Notes                          |
| ------------- | ------------- | -------------------------------- | ------------------------------ |
| **Dawarich**  | `cog`         | `_type: "location"`              | OwnTracks-compatible format    |
| **OwnTracks** | `cog`         | `_type: "location"`, `tid: "AA"` | Standard OwnTracks HTTP format |
| **Reitti**    | `bear`        | `_type: "location"`              | Standard field names           |
| **Custom**    | `bear`        | _(none)_                         | Fully user-defined             |

All templates share the same base fields: `lat`, `lon`, `acc`, `alt`, `vel`, `batt`, `bs`, `tst`. The key differences are the bearing field name and auto-included custom fields.

### Dawarich Integration

1. **Install Dawarich** (see [Dawarich docs](https://github.com/Freika/dawarich))

2. **Get API Key** from Dawarich settings

3. **Configure Colota**:

   - Go to **Settings > API Settings**
   - Select the **Dawarich** template
   - Set your endpoint:
     ```
     https://dawarich.yourdomain.com/api/v1/owntracks/points?api_key=YOUR_API_KEY
     ```
   - Choose a sync mode (e.g., Batch 5 minutes)

4. **Example payload** (auto-configured by template):
   ```json
   {
     "_type": "location",
     "lat": 51.495065,
     "lon": -0.043945,
     "acc": 12,
     "alt": 519,
     "vel": 0,
     "batt": 85,
     "bs": 2,
     "tst": 1704067200,
     "cog": 180.5
   }
   ```
   Note: Dawarich uses `cog` (course over ground) instead of `bear` for bearing.

### OwnTracks Integration

1. **Install OwnTracks Recorder** (see [OwnTracks docs](https://owntracks.org/booklet/))

2. **Configure Colota**:

   - Go to **Settings > API Settings**
   - Select the **OwnTracks** template
   - Set your endpoint URL

3. **Example payload** (auto-configured by template):
   ```json
   {
     "_type": "location",
     "tid": "AA",
     "lat": 51.495065,
     "lon": -0.043945,
     "acc": 12,
     "alt": 519,
     "vel": 0,
     "batt": 85,
     "bs": 2,
     "tst": 1704067200,
     "cog": 180.5
   }
   ```
   The template adds `_type: "location"` and `tid: "AA"` (tracker ID) automatically.

### Reitti Integration

1. **Install Reitti** (see [Reitti documentation](https://github.com/Moo-Ack-Productions/reitti))

2. **Configure Colota**:

   - Go to **Settings > API Settings**
   - Select the **Reitti** template
   - Set your endpoint URL

3. **Example payload** (auto-configured by template):
   ```json
   {
     "_type": "location",
     "lat": 51.495065,
     "lon": -0.043945,
     "acc": 12,
     "alt": 519,
     "vel": 0,
     "batt": 85,
     "bs": 2,
     "tst": 1704067200,
     "bear": 180.5
   }
   ```
   Reitti uses standard field names (including `bear` for bearing).

### Custom Backend

**Minimum server requirements:**

- Accepts HTTPS POST requests (HTTP allowed for localhost: 127.0.0.1, 192.168.x.x, 10.x.x.x)
- Parses JSON payload
- Returns 200-299 status code on success
- Optional: Authentication via headers or query params

#### Authentication

Colota supports multiple authentication methods, configurable in **Settings > Authentication & Headers**:

| Method             | Description                 | Header Sent                     |
| ------------------ | --------------------------- | ------------------------------- |
| **None**           | No authentication (default) | -                               |
| **Basic Auth**     | Username + password         | `Authorization: Basic <base64>` |
| **Bearer Token**   | API token / JWT             | `Authorization: Bearer <token>` |
| **Custom Headers** | Any key-value pairs         | As configured                   |

All credentials are stored encrypted on-device using AES-256-GCM via Android's EncryptedSharedPreferences. You can also add custom HTTP headers for proxies, API gateways, or services like Cloudflare Access.

**Example payload:**

```json
{
  "lat": 51.495065,
  "lon": -0.043945,
  "acc": 12,
  "alt": 519,
  "vel": 0,
  "batt": 85,
  "bs": 2,
  "tst": 1704067200,
  "bear": 0.0
}
```

**Field mapping** (fully customizable in app):

- `lat` - Latitude (required)
- `lon` - Longitude (required)
- `acc` - Accuracy in meters
- `alt` - Altitude in meters (optional)
- `vel` - Velocity/Speed in m/s (optional, only if moving)
- `batt` - Battery level 0-100
- `bs` - Battery status: 0=unknown, 1=unplugged, 2=charging, 3=full
- `tst` - Timestamp in Unix seconds
- `bear` - Bearing/Direction in degrees (optional)

---

## Configuration

### Sync Presets

| Preset          | Interval | Distance | Sync Interval | Retry Interval | Best For        |
| --------------- | -------- | -------- | ------------- | -------------- | --------------- |
| **Instant**     | 5s       | 0m       | Instant (0s)  | 30s            | City navigation |
| **Balanced**    | 30s      | 1m       | 5 minutes     | 5 minutes      | Daily commute   |
| **Power Saver** | 60s      | 2m       | 15 minutes    | 15 minutes     | Long trips      |
| **Custom**      | 1s-∞     | 0m-∞     | 0s-∞          | 30s-∞          | Advanced users  |

### GPS Settings

| Setting            | Description                          | Default   | Range      |
| ------------------ | ------------------------------------ | --------- | ---------- |
| Tracking Interval  | Time between GPS fixes               | 5 seconds | 1s - hours |
| Movement Threshold | Minimum movement to trigger update   | 0 meters  | 0m - 1000m |
| Accuracy Threshold | Filter out fixes above this accuracy | 50 meters | 0m - 1000m |
| Filter Inaccurate  | Enable/disable accuracy filtering    | Disabled  | On/Off     |

### Server Settings

| Setting        | Description                         | Default         | Range       |
| -------------- | ----------------------------------- | --------------- | ----------- |
| Endpoint       | HTTPS URL of your server            | Empty (offline) | -           |
| Sync Interval  | Batch mode interval                 | Instant (0)     | 0s - 60min  |
| Retry Interval | Time between retry attempts         | 30 seconds      | 30s - 15min |
| Max Retries    | Maximum retry attempts per location | 5               | 3, 5, 10, ∞ |
| Offline Mode   | Disable all network activity        | Disabled        | On/Off      |

### Advanced Settings

- **API backend templates**: Pre-configured field mappings for Dawarich, OwnTracks, Reitti, or fully custom
- **Custom field mapping** for any JSON structure
- **Custom static fields**: Add arbitrary key-value pairs included in every API payload (e.g., `_type: "location"`)
- **Authentication settings**: Configure Basic Auth, Bearer Token, or custom HTTP headers
- **Retry strategy**: Exponential backoff with configurable intervals
- **Queue management**: Automatic cleanup of failed items after max retries
- **Network detection**: Auto-sync when connection becomes available

### Field Mapping

Customize JSON field names to match your server's API:

```json
// Default mapping
{
  "lat": 48.1351,
  "lon": 11.5820,
  "acc": 12
}

// Custom mapping (e.g., for specific backend)
{
  "latitude": 48.1351,
  "longitude": 11.5820,
  "accuracy_m": 12,
  "timestamp_unix": 1704067200
}
```

---

## Geofencing (Silent Zones)

Create zones where tracking automatically pauses.

### Use Cases

- **Home**: Don't track when at home
- **Work**: Pause tracking during work hours
- **Frequent locations**: Save battery in places you visit often

### Setup

1. Go to "Geofences" tab
2. Enter a name and radius
3. Tap the map to place the geofence
4. Enable "Pause Tracking"

### How it Works

- Zone detection uses Haversine formula (1-2ms per check)
- When entering a silent zone, GPS stops updating
- Notification shows "Paused: [Zone Name]"
- When exiting, tracking automatically resumes
- Zone checks happen every location update (minimal overhead)

---

## API Documentation

### REST Endpoint Requirements

**Method:** `POST`

**Headers:**

```
Content-Type: application/json
Accept: application/json (optional)
```

**Body:**

```json
{
  "lat": 48.135124,
  "lon": 11.581981,
  "acc": 12,
  "alt": 519,
  "vel": 0,
  "batt": 85,
  "bs": 2,
  "tst": 1704067200,
  "bear": 180.5
}
```

**Success Response:**

```
Status: 200-299
Body: Any (ignored)
```

**Error Handling:**

- **4xx errors**: Logged, retried according to settings
- **5xx errors**: Exponential backoff applied
- **Network timeout**: Retried with backoff (10s connection, 10s read)
- **Max retries exceeded**: Item removed from queue and logged

**Retry Strategy:**

```
Attempt 1: Immediate
Attempt 2: +30s delay
Attempt 3: +60s delay (1 minute)
Attempt 4: +300s delay (5 minutes)
Attempt 5+: +900s delay (15 minutes)
```

After max retries (default: 5), failed items are automatically removed from the queue.

---

## Battery

### Optimizations

- Notification throttling: max 1 update per 10 seconds, plus 2-meter movement filter
- Batch processing: 50 items per batch, 10 concurrent network requests
- Smart sync: only syncs when queue has items and network is available
- Battery critical shutdown: stops tracking below 5% (unplugged)

### Tips

1. Increase GPS interval (5s → 30s saves significant battery)
2. Enable accuracy filtering (reject poor GPS fixes)
3. Use batch sync instead of instant (reduces network usage)
4. Create geofences for home/work (GPS stops in zones)
5. Enable movement threshold (10-50m, skip stationary updates)
6. Disable battery optimization for Colota in Android settings

---

## Privacy

### What Colota Does Not Do

- No analytics or telemetry
- No crash reporting (unless opted in via Android system)
- No advertising IDs or user accounts
- No cloud services or third-party network calls

### Data Storage

- All location data stored locally in SQLite
- Database location: `/data/data/com.Colota/databases/Colota.db`
- Only sent to your server if you configure an endpoint
- Can operate fully offline

### Network Communication

- HTTPS required for all public endpoints
- HTTP allowed only for private/local addresses (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- Only communicates with your configured server
- Network can be completely disabled (offline mode)

### Permissions

| Permission           | Required | Purpose                                  |
| -------------------- | -------- | ---------------------------------------- |
| Location (Precise)   | Yes      | GPS tracking                             |
| Foreground Service   | Yes      | Background tracking with notification    |
| Boot Completed       | Optional | Auto-start after device reboot           |
| Internet             | Optional | Server sync (not needed for offline use) |
| Battery Optimization | Exempt   | Prevent Android from killing service     |

---

## Contributing

### Reporting Issues

1. Check if issue already exists in [Issues](https://github.com/dietrichmax/colota/issues)
2. Provide device info (model, Android version, Colota version)
3. Include logs if possible (`adb logcat | grep Colota`)
4. Describe steps to reproduce

### Pull Requests

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Test on a real device
5. Open Pull Request

### Code Style

- TypeScript/React Native for the UI layer
- Kotlin for native Android modules
- Follow existing patterns in the codebase
- Run `npm run lint` and `npx tsc --noEmit` before submitting

---

## Troubleshooting

### App doesn't track in background

- Go to Settings → Apps → Colota → Battery → Select "Unrestricted"
- Verify location permissions are "Allow all the time"
- Ensure foreground notification is visible

### GPS accuracy is poor

- Wait for GPS lock (can take 30-60 seconds)
- Move to an open area away from buildings
- Check if "High Accuracy" is enabled in device location settings
- Enable "Filter Inaccurate Locations" in app settings

### Server sync not working

1. Check endpoint URL format (must be `https://` or `http://localhost`)
2. Use "Test Connection" button in settings
3. Check server logs for incoming requests
4. Verify network connectivity
5. Check queue count in Data Management

Common causes: wrong URL, HTTPS required for non-localhost, expired SSL certificate, incorrect authentication, mismatched field mapping.

### Database growing too large

- Use "Clear Sent History" to remove synced locations
- Use "Delete Older Than X Days" for cleanup
- Export data first if you want to keep it
- Use "Vacuum Database" to reclaim space after deletions

Size reference: ~200 bytes per location, ~2 MB per 10,000 locations.

---

## FAQ

**Q: Do I need a server?** A: No. The app stores location history locally. Server sync is optional.

**Q: What data does the app send?** A: Only GPS data to your configured server. Nothing else. No analytics, no telemetry.

**Q: Is this compatible with Google Timeline?** A: No, but you can use Dawarich or a custom backend for similar functionality.

**Q: Does this work without Google Play Services?** A: Not currently — it uses FusedLocationProvider. A future version may support alternatives.

**Q: Why AGPL-3.0?** A: To ensure modifications stay open source, especially server-side components.

**Q: How accurate is the tracking?** A: 3-10 meters in open sky, 10-50 meters in urban areas. Accuracy filtering helps remove poor fixes.

**Q: Can I export my location history?** A: Yes. Go to Export Data to export in CSV, GeoJSON, GPX, or KML.

---

## License

```
Colota - Self-Hosted GPS Tracking App
Copyright (C) 2026 Max Dietrich

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
```

See [LICENSE](LICENSE) for the full text.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/dietrichmax/colota/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dietrichmax/colota/discussions)
- **Sponsor**: [GitHub Sponsors](https://github.com/sponsors/dietrichmax)
- **Ko-fi**: [Buy me a coffee](https://ko-fi.com/maxdietrich)
