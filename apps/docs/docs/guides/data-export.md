---
sidebar_position: 2
---

# Data Export

Export your location history in multiple formats.

## Supported Formats

| Format      | Extension  | Use Case                    |
| ----------- | ---------- | --------------------------- |
| **CSV**     | `.csv`     | Spreadsheets, data analysis |
| **GeoJSON** | `.geojson` | Web mapping, GIS tools      |
| **GPX**     | `.gpx`     | GPS devices, hiking apps    |
| **KML**     | `.kml`     | Google Earth, mapping       |

## How to Export

### Bulk Export

1. Go to **Data Management**
2. Tap **Export Data**
3. Select the format
4. Share the exported file via Android's share menu

### Trip Export

1. Go to **Location History** → **Trips** tab
2. Tap the export icon to export all trips for the selected day, or tap a trip card and export that single trip
3. Select the format
4. Share via Android's share menu

Trip exports include a `trip` column/property so each location is tagged with its trip number.

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/ExportData.png", label: "Export Data" }, ]} />

## Scheduled Export (Auto-Export)

Automatically export your location data on a schedule without opening the app.

### Setup

1. Go to **Data Management** > **Export Data**
2. Tap the **Auto-Export** card at the bottom
3. Select an export directory (files are saved there via Android's Storage Access Framework)
4. Choose a format (CSV, GeoJSON, GPX, or KML)
5. Set the frequency: **Daily**, **Weekly**, or **Monthly**
6. Enable the toggle

You can also tap **Export Now** to trigger an immediate export using your current auto-export settings, without waiting for the next scheduled run.

### Export Range

- **All data** - exports every stored location each time
- **Since last export** - only exports locations recorded since the previous auto-export

### File Retention

By default, auto-export keeps the last **10** export files and deletes older ones automatically. You can change this in the **File Retention** setting (1, 5, 10, 30, or Unlimited).

### How it works

- Uses Android WorkManager with a daily check interval - the worker runs every 24 hours and checks whether an export is actually due based on your chosen frequency
- Promotes to a foreground service during export, preventing Android from killing long-running exports
- Streams data in chunks (10,000 locations at a time) to keep memory usage low even with very large datasets
- Writes to a temporary file first, then copies to the export directory - if something goes wrong mid-export, you never get a partial or corrupted file
- After copying, verifies the destination file exists and has the correct size before deleting the temp file
- Requires battery not low - exports are deferred when battery is critically low
- If the export loop is cancelled (e.g. by disabling auto-export), it cleans up gracefully without leaving partial files
- Permanent errors (invalid config, directory access issues) fail immediately; transient errors (I/O failures) retry up to 3 times
- If the selected directory becomes inaccessible (permissions revoked), auto-export disables itself and a notification prompts you to re-select the directory
- A notification is shown after each export with the file name and location count
- Old export files beyond the retention limit are cleaned up after each successful export

:::note **Monthly** frequency uses a calendar month (e.g. Jan 15 to Feb 15), not a fixed 30-day interval. **Daily** and **Weekly** use fixed 24h and 168h intervals respectively. All schedules are approximate due to Android battery optimization.

:::

### File naming

Files are saved as `colota_export_<timestamp>.<ext>` in the selected directory.

## Storage Reference

- ~200 bytes per location
- ~2 MB per 10,000 locations
