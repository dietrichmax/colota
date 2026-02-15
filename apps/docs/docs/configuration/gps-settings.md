---
sidebar_position: 2
---

# GPS Settings

## Available Settings

| Setting            | Description                          | Default   | Range      |
| ------------------ | ------------------------------------ | --------- | ---------- |
| Tracking Interval  | Time between GPS fixes               | 5 seconds | 1s - hours |
| Movement Threshold | Minimum movement to trigger update   | 0 meters  | 0m - 1000m |
| Accuracy Threshold | Filter out fixes above this accuracy | 50 meters | 0m - 1000m |
| Filter Inaccurate  | Enable/disable accuracy filtering    | Disabled  | On/Off     |

## Tracking Interval

How often the app requests a GPS fix. Shorter intervals give denser track points but drain more battery.

- **1-5 seconds**: High detail, suitable for driving or cycling
- **15-30 seconds**: Good balance for walking or commuting
- **60+ seconds**: Low battery usage, suitable for long trips

## Movement Threshold

Only records a new location if you've moved at least this many meters since the last recorded point. Useful for filtering out stationary noise.

- **0m**: Record every GPS fix (default)
- **10-50m**: Skip stationary updates, good for daily use

## Accuracy Filter

When enabled, GPS fixes with accuracy worse than the threshold are discarded. This prevents recording poor-quality positions from indoor or urban environments.

Colota uses Android's `HIGH_ACCURACY` positioning mode, which combines GPS, Wi-Fi, and cellular data.
