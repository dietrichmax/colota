---
sidebar_position: 6
---

# Traccar

[Traccar](https://www.traccar.org/) is an open source GPS tracking platform.

Colota connects to Traccar using the OsmAnd protocol, which sends location data as HTTP GET query parameters.

## Setup

1. **Install Traccar** - follow the [Traccar documentation](https://www.traccar.org/documentation/)
2. **Create a device** in the Traccar web interface and note the device identifier
3. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **Traccar** template (this auto-selects GET as HTTP method)
   - Set the `id` custom field to your Traccar device identifier
   - Set your endpoint:
     ```
     https://traccar.yourdomain.com:5055/
     ```

The default OsmAnd protocol port is **5055**. Adjust if you changed it in your Traccar configuration.

## Request Format

The Traccar template uses HTTP GET with query parameters:

```
GET https://traccar.yourdomain.com:5055/?id=colota&lat=51.495065&lon=-0.043945&accuracy=12&altitude=519&speed=0&batt=85&charge=2&timestamp=1704067200&bearing=180.5
```

## Field Mapping

| Colota Field | Traccar Parameter | Description           |
| ------------ | ----------------- | --------------------- |
| `lat`        | `lat`             | Latitude              |
| `lon`        | `lon`             | Longitude             |
| `acc`        | `accuracy`        | GPS accuracy (meters) |
| `alt`        | `altitude`        | Altitude (meters)     |
| `vel`        | `speed`           | Speed (m/s)           |
| `batt`       | `batt`            | Battery level (0-100) |
| `bs`         | `charge`          | Charging status       |
| `tst`        | `timestamp`       | Unix timestamp        |
| `bear`       | `bearing`         | Bearing (degrees)     |

## Notes

- The `id` custom field is required - Traccar uses it to identify the device
- Traccar also supports POST with JSON, but the OsmAnd GET protocol is the simplest integration
- If you need POST, switch the HTTP method to POST and adjust field names as needed
