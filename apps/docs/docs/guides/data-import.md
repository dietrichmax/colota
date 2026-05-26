---
sidebar_position: 3
---

# Data Import

Merge location history from external files into your Colota database.

:::tip[Looking for a full archive restore?]

Data Import is **additive**: existing locations are preserved and duplicates are skipped. Use this to recover from a Colota export, migrate from Google Timeline, or pull historical data from another tracker. If you want to **replace everything** on the device from an encrypted Colota archive (locations, settings, credentials), use [Backup & Restore](backup-restore.md).

:::

## Supported Formats

The format is detected automatically from the file content; you don't pick it.

| Format | Extension | Source |
| --- | --- | --- |
| **GeoJSON** | `.geojson` | Colota's own export. Any FeatureCollection of Point features with a `time` property also works. |
| **Google Timeline (legacy)** | `Records.json` | Older bulk Location History export from [Google Takeout](https://takeout.google.com). Google removed Location History from Takeout in late 2024 - use this format for files exported before then. |
| **Google Timeline (new)** | `.json` | On-device export from **Android Settings → Location → Location services → Timeline → Export Timeline data**. |
| **GPX** | `.gpx` | GPS Exchange Format. Sport watches (Garmin TrackPointExtension supported), Strava, generic trackers. |
| **KML** | `.kml` | Keyhole Markup Language. Google Earth, My Maps. Placemarks with TimeStamps only. |
| **CSV** | `.csv` | Any CSV with `latitude`, `longitude`, and a time column. Column order doesn't matter. |

For exotic formats (Strava `.fit`, OwnTracks `.rec`, custom tracker dumps) - convert them to one of the above first.

### Getting a Google Timeline file

Google moved Location History off the cloud onto the phone in late 2024, so the export path depends on when you saved your data:

- **Google Takeout** (legacy `Records.json`): visit [takeout.google.com](https://takeout.google.com), choose **Location History** → **Export**. Google removed Location History from Takeout in late 2024, so this only succeeds for accounts that exported before then.
- **Google Maps app** (current): open Google Maps → tap your profile picture → **Your Timeline** → **Settings** → **Export Timeline data**. Exact menu names shift between Maps versions, so look for an "Export Timeline data" entry.
- **Android device settings** (current): **Settings → Location → Location services → Timeline → Export Timeline data**.

The exported file is saved to your phone's `Downloads` folder.

## How to Import

1. Go to **Settings → Import Locations**
2. Tap **Choose File** and pick the file you want to import
3. Wait for the parse to finish (large Google Timeline files can take 10+ seconds)
4. Review the preview: format, points found, duplicates that will be skipped, invalid rows, date range
5. Choose **Import** (or **Import + Queue for Sync** - see below)

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/ImportLocations.png", label: "Import Locations" }, ]} />

### How duplicates are handled

Two rows are considered duplicates when they share the same timestamp (1-second precision) **and** their latitude/longitude match to ~10 cm. This means:

- Re-importing the same file is safe: every row is recognised as a duplicate, nothing changes.
- Two genuinely different samples taken seconds apart from nearby coordinates are both kept.
- Both file-internal duplicates (same point listed twice in the source) and DB-vs-file duplicates (the row already exists in your history) are detected.

### Invalid rows

Rows are dropped silently as "invalid" when any of the following hold:

- Missing latitude, longitude, or timestamp
- Coordinates out of range (latitude not in [-90, 90] or longitude not in [-180, 180])
- Timestamp more than 5 minutes in the future
- Geometry type isn't a single Point (LineString-only KML Placemarks for example)

The preview shows the invalid count so you can decide whether to proceed.

## Import vs Import + Queue for Sync

If you've configured an optional sync backend in **Settings → Connection**, the confirm dialog offers two import buttons. The choice only affects whether the imported rows are also pushed out to that backend; either way the points land in Colota's local history.

### Import

- Rows are written into Colota with `sent=1` - flagged as already replicated.
- **The sync engine will not push them to your backend.**
- Use this when the backend already holds these points - for example, you're re-importing your own Colota export, or repopulating local history after a "Clear Sent History".

### Import + Queue for Sync

- Rows are written into Colota with `sent=0` and enqueued for upload.
- The next sync cycle replicates them to your configured backend.
- Use this when the points are new to your backend - for example, you imported a Google Timeline archive and want the backend copy to mirror it too.

This button is **only shown when a sync endpoint is configured and offline mode is off**. If it's missing, configure sync in **Settings → Connection** first.

:::warning[Queueing fans the points out to your backend - irreversible there]

Once queued, the rows are uploaded as soon as the next sync runs. Removing them from the backend afterwards isn't something Colota can do for you. If you're importing a multi-year archive (100k+ points), expect the queue to fire that many upload requests against your backend; make sure it can handle the load.

:::

## After Import

- Imported rows show up immediately on the **Dashboard** and **Location History** screens.
- Trip detection re-runs on demand the next time you open a screen that uses it (the trip computation is derived from the locations table on the fly).
- If you imported with **Import + Queue for Sync**, the queue counter in **Data Management** reflects the new pending rows; the next sync cycle replicates them to your configured backend.

## Edge Cases

- **KML LineString-only tracks** are skipped. KML's schema doesn't carry per-vertex timestamps, so we can't invent them. The vertices count as "invalid" in the preview so you know data was dropped.
- **GPX without `<time>`** elements are skipped. Same reason - the locations table requires a timestamp.
- **CSV without lat/lon/time columns** is rejected with a clear error rather than silently producing zero rows.
- **Very large files** (500 MB+ Google Timeline exports) parse without loading the full document into memory. Expect the preview phase to take some seconds; the actual commit is fast once you confirm.
- **The Import + Queue button is greyed out** if you're in offline mode or have no sync endpoint configured - this is intentional, the queue has no destination in that state.

## Tip: back up before importing

Imports can't be selectively undone. If you import the wrong file, removing only the imported rows means finding them by timestamp range - which also kills any legitimate data in that range. Take a [Backup](backup-restore.md) before a large import if you're unsure.
