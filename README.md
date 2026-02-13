# Colota

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0) ![Version](https://img.shields.io/github/v/release/dietrichmax/colota) [![Android](https://img.shields.io/badge/Platform-Android-green.svg)](https://developer.android.com) [![Kotlin](https://img.shields.io/badge/Language-Kotlin-purple.svg)](https://kotlinlang.org) [![Shield: Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-Support-yellow?logo=buymeacoffee)](https://ko-fi.com/maxdietrich)

**Self-hosted GPS tracking app for Android**

Colota is an open-source GPS tracker designed for users who run their own server infrastructure. Track your location with complete privacy and control—no cloud dependency, no third-party services, no data sharing.

[Download on Google Play](https://play.google.com/store/apps/details?id=com.Colota&hl=en-US) | [View Screenshots](#screenshots) | [Documentation](#documentation)

---

## Features

### 🏠 Self-Hosted

- **Optional REST API connection** to your own server
- **Works completely offline** without any server
- **HTTPS-encrypted** data transmission (HTTP allowed for localhost development)
- **Built-in API templates** for **Dawarich**, **OwnTracks**, and **Reitti**
- Works with any backend that accepts JSON over HTTP (e.g., Home Assistant, Traccar, NodeRED)
- Free choice of backend system

### 📍 GPS Tracking

- **High-precision positioning** (HIGH_ACCURACY mode)
- **Configurable intervals** (1 second to hours)
- Records: coordinates, accuracy, altitude, speed, bearing, battery status
- **Accuracy filter** for invalid GPS fixes
- **Movement threshold** - only record if moved X meters
- **Foreground service** for reliable 24/7 background tracking
- **Smart retry logic** with exponential backoff

### 🛡️ Geofencing

- **Unlimited geofence zones** (silent zones)
- **Automatic tracking pause** in defined areas
- Freely adjustable radius
- **Battery optimization** through GPS pause in zones
- **Instant zone detection**

### 📡 Sync Modes

- **Instant Mode**: Send each position immediately (0s)
- **Batch Mode**: Batch transmission (1/5/15 minutes)
- **Manual Mode**: Synchronize only on demand
- **Offline Mode**: Pure local storage without network
- **Intelligent retry**: Failed uploads retry with backoff (30s → 60s → 5min → 15min)
- **Network-aware**: Auto-sync when network becomes available
- **Queue management**: Automatic cleanup of permanently failed items

### 📤 Data Export

- **Export location history** in 4 standard formats
- **CSV** for spreadsheets and data analysis
- **GeoJSON** for mapping tools (Mapbox, Leaflet, QGIS)
- **GPX** for GPS tools (Garmin, Strava, Google Earth)
- **KML** for Google Earth and Google Maps
- **Share exported files** directly from the app

### 🔑 Authentication

- **Multiple authentication methods**: None, Basic Auth, Bearer Token
- **Custom HTTP headers** for proxies and access control
- **AES-256-GCM encrypted storage** for all credentials on device

### 🔄 Reliability

- **Auto-start on boot** resumes tracking after device restart
- **Battery critical monitoring** stops tracking below 5% when unplugged
- **Server health check** with 3-stage fallback (health endpoint → HEAD → root domain)
- **Persistent foreground service** survives app restarts and system cleanup

### 🔐 Privacy & Security

- **100% Open Source** (AGPL-3.0)
- **No telemetry or analytics**
- **No third-party tracking SDKs**
- **HTTPS-only** server communication (except localhost)
- **Data stays on your device** or your server
- **No cloud services** - fully self-contained

---

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

---

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

### 1. Basic Setup (Offline Mode)

1. Install the app
2. Grant location permissions (**precise location**)
3. Disable battery optimization for Colota
4. Press "▶ Start Tracking"
5. View live coordinates on dashboard

**That's it!** The app works completely offline.

---

## Server Setup

### API Templates

Colota includes built-in API templates for popular backends. Select a template in **Settings > API Settings** to auto-configure field mappings and custom fields.

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

Choose from optimized presets or create custom settings:

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

Create zones where tracking automatically pauses:

### Use Cases

- **Home**: Don't track when at home (privacy)
- **Work**: Pause tracking during work hours
- **Friends/Family**: Respect privacy when visiting others
- **Battery saving**: Stop GPS in areas you visit frequently

### Setup

1. Go to "Geofences" tab
2. Tap "Add Geofence"
3. Set name, coordinates, radius
4. Enable "Pause Tracking"
5. Save

### How it Works

- **Zone detection** uses Haversine formula (1-2ms per check)
- When entering a silent zone, GPS stops updating
- Notification shows "Paused: [Zone Name]"
- When exiting, tracking **automatically resumes** with notification update
- Saves battery by stopping GPS in defined areas
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

After **max retries** (default: 5), failed items are automatically removed from the queue to prevent accumulation.

---

## Battery Optimization

Colota is heavily optimized for long-running background tracking:

### Optimizations Applied

- **Notification throttling**: Max 1 update per 10 seconds, plus 2-meter movement filter
- **Batch processing**: 50 items per batch, 10 concurrent network requests
- **Smart sync**: Only syncs when queue has items and network available
- **Battery critical shutdown**: Automatically stops tracking when battery drops below 5% (unplugged)

### Battery Life Estimates

| Mode               | Estimated Runtime | GPS Interval | Notes                    |
| ------------------ | ----------------- | ------------ | ------------------------ |
| **High Accuracy**  | 10-12 hours       | 2-5 seconds  | Full precision tracking  |
| **Balanced**       | 18-24 hours       | 30 seconds   | Good balance             |
| **Eco Mode**       | 36-48 hours       | 5 minutes    | Periodic position checks |
| **With Geofences** | +20-40%           | Any          | GPS off in zones         |

_Based on typical Android device with 4000mAh battery_

### Tips for Better Battery Life

1. **Increase GPS interval** (5s → 30s or higher)
2. **Enable accuracy filtering** (reject poor GPS fixes)
3. **Use batch sync** instead of instant (reduces network usage)
4. **Create geofences** for home/work (GPS stops in zones)
5. **Enable movement threshold** (10-50m, only record significant movement)
6. **Disable battery optimization** for Colota (prevents Android from killing service)

---

## Privacy

### Data Collection

**Colota collects ZERO data about you.**

- ❌ No analytics
- ❌ No crash reporting (unless you opt-in via system)
- ❌ No telemetry
- ❌ No advertising IDs
- ❌ No user accounts
- ❌ No cloud services
- ✅ 100% local or self-hosted

### Data Storage

- All location data stored locally in SQLite
- Database location: `/data/data/com.Colota/databases/Colota.db`
- Only sent to **YOUR** server if configured
- Can operate **100% offline** forever
- No automatic uploads to third parties

### Network Communication

- **HTTPS required** for all public endpoints
- **HTTP allowed** only for private/local addresses (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- No telemetry or analytics endpoints
- Only communicates with **your configured server**
- Network can be completely disabled (offline mode)
- Android network security config enforces cleartext restrictions

### Permissions Required

| Permission           | Required | Purpose                                  |
| -------------------- | -------- | ---------------------------------------- |
| Location (Precise)   | Yes      | GPS tracking (app purpose)               |
| Foreground Service   | Yes      | Background tracking with notification    |
| Boot Completed       | Optional | Auto-start after device reboot           |
| Internet             | Optional | Server sync (not needed for offline use) |
| Battery Optimization | Exempt   | Prevent Android from killing service     |

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Reporting Issues

1. Check if issue already exists in [Issues](https://github.com/dietrichmax/colota/issues)
2. Provide device info (model, Android version, Colota version)
3. Include logs if possible (`adb logcat | grep Colota`)
4. Describe steps to reproduce
5. Attach screenshots if relevant

### Pull Requests

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Test thoroughly on real device
5. Update documentation if needed
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open Pull Request with detailed description

### Code Style

- Follow Kotlin conventions and best practices
- Use meaningful variable names
- Comment complex logic and algorithms
- Add unit tests for new features
- Ensure no memory leaks (proper coroutine lifecycle)
- Update README if adding user-facing features

---

## Troubleshooting

### App doesn't track in background

**Solution:**

- Go to Settings → Apps → Colota → Battery
- Select "Unrestricted" or "Don't optimize"
- Verify location permissions are "Allow all the time"
- Ensure foreground notification is visible
- Check if service is running: `adb shell dumpsys activity services | grep Colota`

### GPS accuracy is poor

**Solution:**

- Wait for GPS lock (can take 30-60 seconds initially)
- Move to open area (away from buildings, trees)
- Check if "High Accuracy" is enabled in device location settings
- Verify accuracy threshold in app (try 50-100m)
- Ensure "Filter Inaccurate Locations" is enabled
- Check if device has good GPS hardware (some cheap phones struggle)

### Server sync not working

**Diagnosis:**

1. Check endpoint URL format (must be `https://` or `http://localhost`)
2. Use "Test Connection" button in settings
3. Check server logs for incoming requests
4. Verify network connectivity
5. Check queue count in database stats
6. Try manual flush to isolate issue

**Common Issues:**

- **HTTPS required**: Non-localhost endpoints must use HTTPS
- **Wrong endpoint**: Verify URL is correct
- **Server not reachable**: Check firewall, DNS, SSL certificate
- **Authentication**: Ensure API key/token is correct
- **Field mapping**: Server may expect different JSON structure

### Battery draining too fast

**Solutions:**

- Increase GPS interval: 5s → 30s (600% battery improvement)
- Enable geofences for home/work (20-40% savings when in zones)
- Use batch sync instead of instant (reduces network overhead)
- Enable movement threshold: 10-50m (skip stationary updates)
- Enable accuracy filtering (reject poor GPS fixes that drain battery)
- Check for other battery-draining apps
- Review app battery usage in Android settings
- Ensure latest version of Colota (performance improvements)

### Database growing too large

**Solutions:**

- Use "Clear Sent History" to remove synced locations
- Use "Delete Older Than X Days" for automatic cleanup
- Export data first if you want to keep it
- Use "Vacuum Database" to reclaim space
- Consider lower tracking frequency if you don't need high precision

**Database size estimates:**

- 1 location ≈ 200 bytes
- 10,000 locations ≈ 2 MB
- 100,000 locations ≈ 20 MB

### Queue not syncing

**Diagnosis:**

```
1. Check Stats:
   - Queued: Shows items waiting to sync
   - Sent: Shows successfully synced items
   - Total: All locations captured

2. If Queued > 0 but not decreasing:
   - Check offline mode (Settings → Connection)
   - Verify endpoint is configured
   - Check network connectivity
   - Review server logs
   - Try manual flush
   - Check max retries setting

3. If Queue growing indefinitely:
   - Server may be rejecting requests
   - Check retry count in Data Management
   - Items exceeding max retries are auto-removed
```

### App crashes on startup

**Solution:**

- Clear app data: Settings → Apps → Colota → Storage → Clear Data
- Reinstall app
- Check Android version compatibility (requires Android 7.0+ / API 24)
- Report issue with crash logs: `adb logcat -d > crash.log`

---

## FAQ

**Q: Does this app track me without my knowledge?**  
A: No. Tracking only happens when you explicitly press "Start Tracking". You have full control. The app shows a persistent notification when tracking is active.

**Q: Do I need a server to use this app?**  
A: No. The app works completely offline and can store unlimited location history locally. Server integration is optional for backup/analysis.

**Q: What data does the app send to the internet?**  
A: Only GPS data to **YOUR** server, and only if you configure an endpoint. No analytics, no telemetry, no third-party services. You can verify this in the source code.

**Q: Is this compatible with Google Timeline?**  
A: No, but you can use Dawarich or a custom backend to create similar functionality with full control over your data.

**Q: Can I use this for fleet management?**  
A: Yes, if you set up your own backend to handle multiple devices. Each device would need Colota installed and configured to your server.

**Q: Does this work without Google Play Services?**  
A: Currently no, it requires Play Services for FusedLocationProvider. A future version may support alternative location providers.

**Q: Why AGPL-3.0 license?**  
A: To ensure that any modifications remain open source, especially for server-side components. If you modify Colota and run it as a service, you must share your changes.

**Q: How accurate is the tracking?**  
A: In ideal conditions (open sky, good GPS signal): 3-10 meters. In urban areas or buildings: 10-50 meters. Accuracy filtering helps remove poor GPS fixes.

**Q: Can I export my location history?** A: Yes! Go to the Export Data screen to export your full location history in **CSV**, **GeoJSON**, **GPX**, or **KML** format. Exported files can be shared directly from the app.

**Q: Does this drain battery like other tracking apps?**  
A: Colota is optimized for efficiency with caching and batching. Expect 10-12 hours of high-accuracy tracking, better with optimized settings.

**Q: What's the difference between "Sent" and "Total" in stats?**  
A: **Total** = all locations captured. **Sent** = successfully synced to server. **Queued** = waiting to sync. Total = Sent + Queued.

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

See [LICENSE](LICENSE) file for full text.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/dietrichmax/colota/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dietrichmax/colota/discussions)

---

## Donate

If you find this app useful, consider supporting development:

- **GitHub Sponsors**: [Sponsor @dietrichmax](https://github.com/sponsors/dietrichmax)
- **Ko-fi**: [Buy me a coffee](https://ko-fi.com/maxdietrich)

Your support helps maintain and improve Colota for the entire self-hosting community!

---
