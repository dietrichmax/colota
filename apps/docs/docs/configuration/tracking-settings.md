---
sidebar_position: 2
---

# Tracking Settings

Found under **Settings → Tracking & Sync → Tracking Configuration**.

## Available Settings

| Setting            | Description                          | Default   | Minimum |
| ------------------ | ------------------------------------ | --------- | ------- |
| Tracking Interval  | Time between GPS fixes               | 5 seconds | 1s      |
| Movement Threshold | Minimum movement to trigger update   | 0         | 0       |
| Accuracy Threshold | Filter out fixes above this accuracy | 50        | 1       |
| Filter Inaccurate  | Enable/disable accuracy filtering    | Disabled  | On/Off  |

The two distance settings use whichever unit you picked in **Settings → Appearance**, so they read as meters or feet. There is no upper limit on any of the three numbers.

:::info[Tracking profiles override two of these]

If a [tracking profile](/docs/guides/tracking-profiles) is active, it supplies its own tracking interval and movement threshold for as long as its condition holds. The values on this screen are what the app falls back to when no profile applies, so a profile is the usual reason fixes arrive at a different rate than the one set here.

:::

## Tracking Interval

How often the app requests a GPS fix. Shorter intervals give denser track points but drain more battery.

- **1-5 seconds**: High detail, suitable for driving or cycling
- **15-30 seconds**: Good balance for walking or commuting
- **60+ seconds**: Low battery usage, suitable for long trips

## Movement Threshold

Only records a new location if you've moved at least this far since the last recorded point. Useful for filtering out stationary noise.

- **0**: Record every GPS fix (default)
- **10-50 m**: Skip stationary updates, good for daily use

## Accuracy Filter

When enabled, GPS fixes with accuracy worse than the threshold are discarded. This prevents recording poor-quality positions from indoor or urban environments.

The accuracy value comes from the GPS chip's own estimate of its confidence, not from ground truth. Chips sometimes report a tight accuracy on a position that is badly wrong, and no threshold can reject those, because the fix does not admit to being imprecise. If a stationary device is filling your history with drift, the [Movement Threshold](#movement-threshold) is the setting that keeps those points out of the log.

The Google Play variant uses Android's `HIGH_ACCURACY` positioning mode via FusedLocationProvider, which combines GPS, Wi-Fi, and cellular data. The FOSS variant requests the same high-accuracy mode from the platform's fused location provider on Android 12+ and falls back to `GPS_PROVIDER` on older versions or ROMs without a fused provider.

## Position-Jump Filter

Some GPS chips occasionally emit a single fix that's far off (10s of km) with a wrong altitude but tight reported accuracy. The accuracy filter can't catch these because the chip lies about its own confidence on those fixes.

Colota drops these automatically by comparing the chip's reported speed against the speed implied by the distance and time since the previous fix. When the two disagree by a wide margin, the fix is discarded. The filter is always on, has no user setting, and only triggers on this specific glitch pattern - normal travel passes through because the chip-reported and implied speeds agree closely.

## See also

- [Sync Presets](sync-presets.md) - how often the queue is flushed to your server, and on which connections
- [Tracking Profiles](/docs/guides/tracking-profiles) - switch interval and movement threshold automatically on charging, speed or a stationary phone
- [Geofencing](/docs/guides/geofencing) - pause GPS entirely inside a zone
