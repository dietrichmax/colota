---
sidebar_position: 6
---

# Traccar

[Traccar](https://www.traccar.org/) is an open source GPS tracking platform. Colota supports two Traccar protocols:

- **OsmAnd (GET)** - sends location as HTTP GET query parameters. Works with all Traccar versions.
- **Traccar JSON (POST)** - sends a structured JSON body. Requires Traccar 6.7.0+.

## Prerequisites

1. **Install Traccar** - follow the [Traccar documentation](https://www.traccar.org/documentation/)
2. **Enable the OsmAnd protocol** in Traccar - both GET and POST use port 5055 via the OsmAnd listener. In your `traccar.xml` config, ensure the OsmAnd port is active (it is by default on standard installs)
3. **Create a device** in the Traccar web interface - the Identifier you enter must match what Colota sends (see below)

## Setup in Colota

1. Go to **Settings > API Settings**
2. Select the **Traccar** template
3. Choose your HTTP method:
   - **GET** - OsmAnd protocol, compatible with all Traccar versions
   - **POST** - Traccar JSON format, requires Traccar 6.7.0+
4. Set your endpoint:
   ```
   http://traccar.yourdomain.com:5055
   ```

## Device Identifier

Traccar identifies devices by a unique identifier. Add a custom field with key `id` and set it to your Traccar device identifier - this is used for both GET and POST.

| Method | Field sent to Traccar    | Source                                                        |
| ------ | ------------------------ | ------------------------------------------------------------- |
| GET    | `id` query parameter     | custom field `id`                                             |
| POST   | `device_id` in JSON body | custom field `id` (or `device_id` if set, otherwise `colota`) |

The current value is visible in the example payload on the API Settings screen.

In Traccar, open **Settings > Devices**, create a new device, and set the **Identifier** to the same value Colota is sending.

## Request Format

### GET (OsmAnd)

```
GET http://traccar.yourdomain.com:5055/?id=my-phone&lat=52.12345&lon=-2.12345&accuracy=15&altitude=380&speed=5&batt=85&charge=2&timestamp=1739362800&bearing=180.0
```

### POST (Traccar JSON)

```json
{
  "location": {
    "timestamp": "2025-02-12T13:00:00Z",
    "coords": {
      "latitude": 52.12345,
      "longitude": -2.12345,
      "accuracy": 15,
      "altitude": 380,
      "speed": 5,
      "heading": 180
    },
    "battery": {
      "level": 0.85,
      "is_charging": false
    }
  },
  "device_id": "colota"
}
```

## Field Mapping

### GET

| Traccar parameter | Description           |
| ----------------- | --------------------- |
| `id`              | Device identifier     |
| `lat`             | Latitude              |
| `lon`             | Longitude             |
| `accuracy`        | GPS accuracy (meters) |
| `altitude`        | Altitude (meters)     |
| `speed`           | Speed (m/s)           |
| `batt`            | Battery level (0-100) |
| `charge`          | Charging status       |
| `timestamp`       | Unix timestamp        |
| `bearing`         | Bearing (degrees)     |

### POST

| JSON field                     | Description            |
| ------------------------------ | ---------------------- |
| `device_id`                    | Device identifier      |
| `location.timestamp`           | ISO 8601 UTC timestamp |
| `location.coords.latitude`     | Latitude               |
| `location.coords.longitude`    | Longitude              |
| `location.coords.accuracy`     | GPS accuracy (meters)  |
| `location.coords.altitude`     | Altitude (meters)      |
| `location.coords.speed`        | Speed (m/s)            |
| `location.coords.heading`      | Bearing (degrees)      |
| `location.battery.level`       | Battery level (0-1)    |
| `location.battery.is_charging` | Charging state         |
