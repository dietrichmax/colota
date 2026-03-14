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

How often the app requests a GPS fix. Shorter intervals give denser track points but drain more battery. The actual recording frequency may be higher due to the passive location listener picking up free fixes from other apps.

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

## Passive Location Listener

In addition to the configured tracking interval, Colota listens for location fixes already requested by other apps on your device (such as maps or navigation apps). These passive fixes are recorded at no extra battery cost and may result in additional data points between your configured interval.

This is intentional behavior - it improves track density when other apps happen to request a location. If you see more points than expected, this is why. The accuracy filter still applies, so poor-quality passive fixes are discarded.
