---
sidebar_position: 5
---

# PhoneTrack (Nextcloud)

[PhoneTrack](https://apps.nextcloud.com/apps/phonetrack) is a Nextcloud app for tracking mobile devices.

## Setup

1. **Install PhoneTrack** from the Nextcloud app store
2. **Create a session** in PhoneTrack and get the logging URL
3. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **PhoneTrack** template
   - Set your endpoint to the PhoneTrack logging URL:
     ```
     https://nextcloud.yourdomain.com/apps/phonetrack/log/gps/SESSION_TOKEN/DEVICE_NAME
     ```

## Payload Format

The PhoneTrack template auto-configures the following payload:

```json
{
  "_type": "location",
  "lat": 51.495065,
  "lon": -0.043945,
  "acc": 12,
  "alt": 519,
  "speed": 0,
  "bat": 85,
  "bs": 2,
  "timestamp": 1704067200,
  "bearing": 180.5
}
```

## Field Mapping

| Colota Field | PhoneTrack Field | Description           |
| ------------ | ---------------- | --------------------- |
| `lat`        | `lat`            | Latitude              |
| `lon`        | `lon`            | Longitude             |
| `acc`        | `acc`            | GPS accuracy (meters) |
| `alt`        | `alt`            | Altitude (meters)     |
| `vel`        | `speed`          | Speed (m/s)           |
| `batt`       | `bat`            | Battery level (0-100) |
| `bs`         | `bs`             | Battery status        |
| `tst`        | `timestamp`      | Unix timestamp        |
| `bear`       | `bearing`        | Bearing (degrees)     |

Note: PhoneTrack uses `speed`, `bat`, `timestamp`, and `bearing` instead of the default `vel`, `batt`, `tst`, and `bear` field names.
