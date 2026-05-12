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

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/ExportData.png", label: "Export Data" }, { src: "/img/screenshots/AutoExport.png", label: "Auto-Export" }, ]} />

## Scheduled Export (Auto-Export)

Automatically export your location data on a schedule without opening the app.

### Setup

1. Go to **Settings > Auto-Export**
2. Select an export directory (files are saved there via Android's Storage Access Framework)
3. Choose a format (CSV, GeoJSON, GPX, or KML)
4. Set the frequency: **Daily**, **Weekly**, or **Monthly**
5. Pick the **Time** (24-hour) in your device's local timezone. For **Weekly**, also pick a day of week. For **Monthly**, pick a day of month (1-31)
6. Enable the toggle

You can also tap **Export Now** to trigger an immediate export using your current auto-export settings, without waiting for the next scheduled run.

### Export Range

- **All data** - exports every stored location each time
- **Since last export** - only exports locations recorded since the previous auto-export

### File Retention

By default, auto-export keeps the last **10** export files and deletes older ones automatically. You can change this in the **File Retention** setting - enter any number or **0** for unlimited (no automatic cleanup).

### How it works

- Uses Android AlarmManager (`setAndAllowWhileIdle`) to fire at your configured wall-clock time. Typical accuracy is within minutes; Doze mode may delay by up to ~15 minutes
- After each export the next alarm is armed automatically. Alarms also re-arm after device reboot
- Exports fire at the configured time, not on enable. To run an export immediately for testing or backup, tap **Export Now**
- Promotes to a foreground service during export, preventing Android from killing long-running exports
- Streams data in chunks (10,000 locations at a time) to keep memory usage low even with very large datasets
- Writes to a temporary file first, then copies to the export directory - if something goes wrong mid-export, you never get a partial or corrupted file
- After copying, verifies the destination file exists and has the correct size before deleting the temp file
- If the export loop is cancelled (e.g. by disabling auto-export), it cleans up gracefully without leaving partial files
- Permanent errors (invalid config, directory access issues) fail immediately; transient errors (I/O failures) retry up to 3 times
- If the selected directory becomes inaccessible (permissions revoked), auto-export disables itself and a notification prompts you to re-select the directory
- A notification is shown after each export with the file name and location count
- Old export files beyond the retention limit are cleaned up after each successful export

:::note

**Monthly** frequency uses a calendar month (e.g. Jan 15 to Feb 15), not a fixed 30-day interval. If the chosen day-of-month doesn't exist in a given month (e.g. day 31 in February), the export runs on the last day of that month instead. **Daily**, **Weekly** and **Monthly** intervals fire at the chosen wall-clock time via Android AlarmManager. Typical accuracy is within minutes.

:::

### File naming

Files are saved as `colota_export_<timestamp>.<ext>` in the selected directory.

## Storage Reference

- ~200 bytes per location
- ~2 MB per 10,000 locations
