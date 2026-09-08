---
sidebar_position: 2
---

# Tracking Settings

Found under **Settings → Tracking & sync → Recording**. The accuracy filter has its own group, **Accuracy filter**, at the bottom of the same screen.

## Available Settings

| Setting                     | Description                       | Default   | Minimum |
| --------------------------- | --------------------------------- | --------- | ------- |
| Interval                    | Time between GPS fixes            | 5 seconds | 1 s     |
| Movement threshold          | Minimum movement to keep a fix    | 0         | 0       |
| Filter inaccurate locations | Enable/disable accuracy filtering | Off       | On/Off  |
| Accuracy threshold          | Drop fixes rated worse than this  | 50        | 1       |

The interval and movement threshold sit under **Custom** in the Recording group; picking a preset sets both. The two distance settings use whichever unit you picked in **Settings → Appearance**, so they read as meters or feet. Every number field takes whole numbers only and states its minimum under its label; a value below it is set to the minimum when you leave the field. There is no upper limit on any of the three numbers.

:::info[Tracking profiles override two of these]

If a [tracking profile](/docs/guides/tracking-profiles) is active, it supplies its own interval, movement threshold and sync interval for as long as its condition holds. The Recording and Sync interval groups then open with a line naming the profile and the values in force, and the rows below stay the defaults the app falls back to when no profile applies. A profile is the usual reason fixes arrive at a different rate than the one set here.

:::

## Interval

How often the app requests a GPS fix. Shorter intervals keep the GPS awake more of the time and record more points.

- **1-5 seconds**: High detail, suitable for driving or cycling
- **15-30 seconds**: Good balance for walking or commuting
- **60+ seconds**: Low battery usage, suitable for long trips

## Movement Threshold

Only records a new location if you've moved at least this far since the last recorded point. Both the interval and this distance must pass before a fix is kept, so a higher threshold saves storage and sync data rather than battery. It is not applied inside a pause zone or by a stationary profile.

- **0**: Record every GPS fix (default)
- **10-50 m**: Skip stationary updates, good for daily use

## Accuracy Filter

When on, fixes the chip rates worse than the threshold are dropped. A stricter threshold leaves gaps indoors and in dense streets, where every fix is rated poorly. The switch's own caption carries the threshold in both states, so turning the filter off hides the field without losing the number.

The accuracy value comes from the GPS chip's own estimate of its confidence, not from ground truth. Chips sometimes report a tight accuracy on a position that is badly wrong, and no threshold can reject those, because the fix does not admit to being imprecise. If a stationary device is filling your history with drift, the [Movement Threshold](#movement-threshold) is the setting that keeps those points out of the log.

The Google Play variant uses Android's `HIGH_ACCURACY` positioning mode via FusedLocationProvider, which combines GPS, Wi-Fi, and cellular data. The FOSS variant requests the same high-accuracy mode from the platform's fused location provider on Android 12+ and falls back to `GPS_PROVIDER` on older versions or ROMs without a fused provider.

## Position-Jump Filter

Some GPS chips occasionally emit a single fix that's far off (10s of km) with a wrong altitude but tight reported accuracy. The accuracy filter can't catch these because the chip lies about its own confidence on those fixes.

Colota drops these automatically by comparing the chip's reported speed against the speed implied by the distance and time since the previous fix. When the two disagree by a wide margin, the fix is discarded. The filter is always on, has no user setting, and only triggers on this specific glitch pattern - normal travel passes through because the chip-reported and implied speeds agree closely.

## See also

- [Sync Presets](sync-presets.md) - how often the queue is flushed to your server, and on which connections
- [Tracking profiles](/docs/guides/tracking-profiles) - switch interval and movement threshold automatically on charging, speed or a stationary phone
- [Geofencing](/docs/guides/geofencing) - pause GPS entirely inside a zone
