---
sidebar_position: 2
---

# Dawarich

[Dawarich](https://github.com/Freika/dawarich) is a self-hosted location history service.

## Setup

1. **Install Dawarich** - follow the [Dawarich documentation](https://dawarich.app/docs/intro)
2. **Get your API Key** from Dawarich settings
3. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **Dawarich** template
   - Set your endpoint:
     ```
     https://dawarich.yourdomain.com/api/v1/owntracks/points?api_key=YOUR_API_KEY
     ```
   - Choose a sync mode (e.g., Batch 5 minutes)

## Payload Format

The Dawarich template ships with two modes, picked via a chip in **Settings > API Settings** when the Dawarich template is selected.

### Single point (default)

Posts one OwnTracks-format point per request to `/api/v1/owntracks/points`. Best for small queues or near-real-time delivery.

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

Note: Dawarich uses `cog` (course over ground) instead of `bear` for the bearing field.

### Batch (Overland)

Bundles up to N queued points into a single request to `/api/v1/overland/batches`, using the [Overland](https://github.com/aaronpk/Overland-iOS) GeoJSON format. Best for high-frequency tracking or flaky cellular networks.

```json
{
  "locations": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-0.043945, 51.495065] },
      "properties": {
        "timestamp": "2026-05-09T12:34:56Z",
        "horizontal_accuracy": 12,
        "altitude": 519,
        "speed": 0,
        "course": 180.5,
        "battery_level": 0.85,
        "battery_state": "charging"
      }
    }
  ],
  "device_id": "colota"
}
```

**Endpoint URL**: change the saved endpoint to `https://dawarich.yourdomain.com/api/v1/overland/batches?api_key=YOUR_API_KEY`. The chip only updates the placeholder hint, not your saved endpoint.

**Batch size**: defaults to 50 points per POST, configurable 1-500 under **Settings > Tracking & Sync > Advanced > Network Settings > Batch Size** (only shown when batch mode is active).

**Requires non-zero sync interval**: batch mode is incompatible with instant sync. Pick a batched preset or set a custom sync interval before enabling. The chip is disabled when sync interval is 0.

**Device identifier**: your Dawarich server sees this device as the value of the `device_id` custom field, defaulting to `"colota"`. Edit it under **Settings > API Settings > Custom Fields** if you run multiple devices.
