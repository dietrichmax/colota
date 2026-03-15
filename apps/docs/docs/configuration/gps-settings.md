---
sidebar_position: 2
---

# GPS Settings

## Available Settings

| Setting                   | Description                                | Default   | Range      |
| ------------------------- | ------------------------------------------ | --------- | ---------- |
| Tracking Interval         | Time between GPS fixes                     | 5 seconds | 1s - hours |
| Movement Threshold        | Minimum movement to trigger update         | 0 meters  | 0m - 1000m |
| Accuracy Threshold        | Filter out fixes above this accuracy       | 50 meters | 1m - 1000m |
| Filter Inaccurate         | Enable/disable accuracy filtering          | Disabled  | On/Off     |
| Pause GPS when stationary | Stop active GPS after 60s without movement | Enabled   | On/Off     |

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

The Google Play variant uses Android's `HIGH_ACCURACY` positioning mode via FusedLocationProvider, which combines GPS, Wi-Fi, and cellular data. The FOSS variant uses Android's native `LocationManager` with `GPS_PROVIDER` directly.

## Pause GPS When Stationary

When enabled, Colota automatically pauses active GPS after 60 seconds of no movement (speed below ~1 km/h). This is the single biggest battery saver for most users, since people are stationary for most of the day.

**How it works:**

1. Speed stays below the threshold for 60 seconds
2. Active GPS is stopped - no more battery-draining satellite fixes
3. The hardware significant motion sensor is armed (near-zero power consumption)
4. When the device starts moving again, the motion sensor fires and active GPS resumes immediately

This uses Android's `TYPE_SIGNIFICANT_MOTION` sensor, which runs entirely in the device's sensor hub and consumes virtually no battery while waiting for motion.

**Interaction with Accuracy Filter:**

Stationary detection only evaluates fixes that pass the accuracy filter. However, once the 60-second countdown starts it runs uninterrupted - gaps where all fixes are filtered out do not reset the timer. In practice this means:

- A tight accuracy threshold (e.g. 10m) may delay the start of the countdown in poor signal conditions, since fewer fixes get through to trigger it.
- Once the countdown has started, it will complete even if subsequent fixes are filtered, as long as no fix with speed above ~1 km/h gets through.
- Very tight accuracy thresholds indoors (where GPS signal is weak) can significantly delay or prevent stationary detection entirely.

If you use a tight accuracy threshold and care about battery life, consider loosening it slightly or leaving the accuracy filter disabled.

**Note:** Not all devices have a significant motion sensor. If the sensor is unavailable, this setting has no effect and GPS runs continuously as normal.
