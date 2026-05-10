---
sidebar_position: 3
---

# Overland

Colota is a drop-in Android client for the [Overland](https://github.com/aaronpk/Overland-iOS) location-tracking format originally designed by Aaron Parecki for iOS. Overland is a portable JSON specification rather than a specific backend, so this template works with any server that accepts the format - including [Compass](https://github.com/aaronpk/Compass), [Dawarich](./dawarich.md)'s `/api/v1/overland/batches` endpoint, [Colota Forwarder](https://github.com/dietrichmax/colota-forwarder), or any custom service that follows the same JSON schema.

## Setup

1. **Pick the Overland template** in **Settings > API Settings**
2. **Set your endpoint** to your Overland-compatible server's batch URL, e.g.:
   ```
   https://overland.yourdomain.com/
   ```
   Some implementations use a path like `/api/v1/overland/batches`. Check your server's docs.
3. **Choose a batched sync preset** (Balanced or Power Saver). Instant sync is not supported because Overland is a batch-only protocol.
4. **Set a `device_id`** in custom fields if you want to override the default `"colota"`.

## Payload Format

Each upload is a single POST containing one or more locations as GeoJSON Features:

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

- `coordinates` follows GeoJSON order: `[longitude, latitude]`.
- `battery_level` is a float 0.0-1.0 (not 0-100).
- `battery_state` is one of `"unknown"`, `"unplugged"`, `"charging"`, `"full"`.
- `device_id` and any other custom fields are placed at envelope level (matching the Overland iOS client), not inside per-Feature properties.

## Configuration

**Batch size**: defaults to 50 points per POST, configurable 1-500 under **Settings > Tracking & Sync > Advanced > Network Settings > Batch Size**. Larger bundles mean fewer round trips but bigger payloads on flaky networks.

**HTTP method**: POST only. The Overland protocol does not support GET; the option is hidden when this template is selected.

**Sync interval**: must be non-zero. Picking instant sync auto-downgrades the format to single-point on the wire because the Overland endpoint expects bundles, not individual points.

## Device Identifier

Your server sees this device as the value of the `device_id` custom field, defaulting to `"colota"`. Edit it under **Settings > API Settings > Custom Fields** if you run multiple devices. If you previously set `tid` (OwnTracks) or `id` (Traccar) as a custom field, that value is reused so you don't have to reconfigure.

## Dawarich Users

If you're sending to Dawarich, you can pick either:

- **Dawarich template + Batch mode** - same wire format, Dawarich-specific endpoint hints
- **Overland template** - same wire format, generic endpoint hints (suited for non-Dawarich Overland-compatible backends)

The data sent is identical. Pick whichever feels more natural for your setup.
