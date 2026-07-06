---
sidebar_position: 2
---

# GPS Settings

## Available Settings

| Setting            | Description                          | Default   | Range      |
| ------------------ | ------------------------------------ | --------- | ---------- |
| Tracking Interval  | Time between GPS fixes               | 5 seconds | 1s - hours |
| Movement Threshold | Minimum movement to trigger update   | 0 meters  | 0m - 1000m |
| Accuracy Threshold | Filter out fixes above this accuracy | 50 meters | 1m - 1000m |
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

The Google Play variant uses Android's `HIGH_ACCURACY` positioning mode via FusedLocationProvider, which combines GPS, Wi-Fi, and cellular data. The FOSS variant requests the same high-accuracy mode from the platform's fused location provider on Android 12+ and falls back to `GPS_PROVIDER` on older versions or ROMs without a fused provider.

## Position-Jump Filter

Some GPS chips occasionally emit a single fix that's far off (10s of km) with a wrong altitude but tight reported accuracy. The accuracy filter can't catch these because the chip lies about its own confidence on those fixes.

Colota drops these automatically by comparing the chip's reported speed against the speed implied by the distance and time since the previous fix. When the two disagree by a wide margin, the fix is discarded. The filter is always on, has no user setting, and only triggers on this specific glitch pattern - normal travel passes through because the chip-reported and implied speeds agree closely.

## Stationary Detection

Stationary detection is available through [tracking profiles](/docs/guides/tracking-profiles) (stationary condition) and [geofence zones](/docs/guides/geofencing) (pause when motionless). See those guides for configuration details.
