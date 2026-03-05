---
sidebar_position: 2
---

# GeoPulse

[GeoPulse](https://github.com/tess1o/geopulse) is a self-hosted location tracking and visualization platform.

## Setup

1. **Install GeoPulse** - follow the [GeoPulse documentation](https://github.com/tess1o/geopulse)
2. **Add a Colota location source** in GeoPulse under **Location Sources**
3. **Set a username and password** for the Colota source
4. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **GeoPulse** template
   - Set your endpoint:
     ```
     https://geopulse.yourdomain.com/api/colota
     ```
   - Go to **Settings > Authentication**
   - Enable **Basic Auth** and enter the username and password from step 3

## Payload Format

The GeoPulse template uses Colota's default field names with no custom fields:

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
  "bear": 180.5
}
```

## Field Mapping

| Colota Field | GeoPulse Field | Description           |
| ------------ | -------------- | --------------------- |
| `lat`        | `lat`          | Latitude              |
| `lon`        | `lon`          | Longitude             |
| `acc`        | `acc`          | GPS accuracy (meters) |
| `alt`        | `alt`          | Altitude (meters)     |
| `vel`        | `vel`          | Speed (m/s)           |
| `batt`       | `batt`         | Battery level (0-100) |
| `bs`         | `bs`           | Battery status        |
| `tst`        | `tst`          | Unix timestamp        |
| `bear`       | `bear`         | Bearing (degrees)     |

Note: GeoPulse also supports OwnTracks as a location source. If you prefer, you can use the OwnTracks template with the endpoint `https://geopulse.yourdomain.com/api/owntracks` instead.
