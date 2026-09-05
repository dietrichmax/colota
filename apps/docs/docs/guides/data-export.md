---
sidebar_position: 2
---

# Data Export

Export your location history in multiple formats.

:::tip[Looking for a full archive?]

Data Export produces shareable, human-readable formats (CSV, GeoJSON, GPX, KML) of your location history. If you instead want a single password-encrypted archive of **everything** - locations, settings, geofences and credentials - for device migration or offsite storage, use [Backup & Restore](backup-restore.md).

:::

## Supported Formats

| Format      | Extension  | Use Case                    |
| ----------- | ---------- | --------------------------- |
| **CSV**     | `.csv`     | Spreadsheets, data analysis |
| **GeoJSON** | `.geojson` | Web mapping, GIS tools      |
| **GPX**     | `.gpx`     | GPS devices, hiking apps    |
| **KML**     | `.kml`     | Google Earth, mapping       |

## How to Export

### Bulk Export

1. Go to **Settings → Export Locations**
2. Select a format
3. Tap **Export** and share the file via Android's share menu

Bulk export always covers your full history. To export a subset, use the trip export below.

For exports on a schedule instead of on demand, see [Scheduled Export](#scheduled-export-auto-export).

### Trip Export

Go to the **History** tab → **Trips**. There are two ways to export:

- **All trips for the day** - tap **Export All** in the header, pick a format, share.
- **A custom selection** - long-press any trip card to enter selection mode. Tap additional cards to add or remove them. Use **Select all** to grab every trip. Tap the share icon in the selection header, pick a format, share. Works for a single trip too.

For a single trip you can also tap the card to open **Trip Detail**, then use the share icon in the header.

Trip exports include a `trip` column/property so each location is tagged with its trip number. Custom selections produce a single file containing only the chosen trips.

To remove trips or single points instead of exporting them, see [Data Management](data-management.md#deleting-from-location-history).

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/ExportData.png", label: "Export Data" }, { src: "/img/screenshots/AutoExport.png", label: "Auto-Export" }, ]} />

## Scheduled Export (Auto-Export)

Automatically export your location data on a schedule without opening the app.

### Setup

1. Go to **Settings → Auto-Export**
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

Retention counts the files your **file name template** matches, which is what decides its scope:

| Template            | Scope                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| Contains `{device}` | Keeps N exports **per device model**. Other models sharing the folder are untouched. |
| No `{device}`       | Keeps N exports **per folder**, counting every Colota export in it.                  |

Changing the template also means files exported under the previous one are no longer managed, since retention only recognises names the current template could have produced. Delete those once by hand. The one exception is switching away from the default `colota_export_{date}_{time}`, whose files stay managed unless the new template contains `{device}`.

:::warning[Several devices, one folder]

If several devices export into the same folder and none of the templates include `{device}`, their files are indistinguishable, so each device counts and deletes the others' exports. Add `{device}` to the file name to separate them.

`{device}` expands to the device **model**, not a unique identifier, so two phones of the same model still share a name and still delete each other's exports. Give them distinct prefixes in the template if you run identical models.

:::

### How it works

- Uses Android AlarmManager (`setAndAllowWhileIdle`) to fire at your configured wall-clock time. Typical accuracy is within minutes; Doze mode may delay by up to ~15 minutes
- After each export the next alarm is armed automatically. Alarms also re-arm after device reboot
- Exports fire at the configured time, not on enable. To run an export immediately for testing or backup, tap **Export Now**
- Promotes to a foreground service during export, preventing Android from killing long-running exports
- Streams data in chunks (10,000 locations at a time) to keep memory usage low even with very large datasets
- Writes to a temporary file first, then copies to the export directory - if something goes wrong mid-export, you never get a partial or corrupted file
- After copying, verifies that every byte of the temp file was written before deleting it. The destination is never queried back, so a folder app that registers the new file late cannot fail the export
- Switching auto-export off stops a running export without leaving partial files; a file already being copied to the folder is finished first
- Permanent errors (invalid config, directory access issues) fail immediately; transient errors (I/O failures, a failed database read) retry up to 3 times
- If the selected directory becomes inaccessible (permissions revoked), auto-export disables itself and a notification prompts you to re-select the directory
- A notification is shown after each export with the file name and location count
- Old export files beyond the retention limit are cleaned up after each successful export. Cleanup only considers files matching Colota's own export naming pattern, so unrelated files and subfolders in the directory are never touched

:::note[Frequency]

**Monthly** frequency uses a calendar month (e.g. Jan 15 to Feb 15), not a fixed 30-day interval. If the chosen day-of-month doesn't exist in a given month (e.g. day 31 in February), the export runs on the last day of that month instead. **Daily**, **Weekly** and **Monthly** intervals fire at the chosen wall-clock time via Android AlarmManager. Typical accuracy is within minutes.

:::

### File naming

Auto-export files are named from a template you set in **File Name**. The default is `colota_export_{date}_{time}`, which produces the same names as before this setting existed, for example `colota_export_2026-05-20_0815.geojson`.

| Placeholder | Expands to                       | Example      |
| ----------- | -------------------------------- | ------------ |
| `{date}`    | Export date, `YYYY-MM-DD`        | `2026-05-20` |
| `{time}`    | Export time, `HHMM` (24h)        | `0815`       |
| `{device}`  | Device model, whitespace removed | `Pixel7`     |

Anything else in the template is used literally, so a prefix or suffix just gets typed in:

```
{device}_colota_export-{date}_{time}
```

produces `Pixel7_colota_export-2026-05-20_0815.gpx`. The settings screen shows a live preview of the name that will be written.

Every template must contain three things, and the field rejects it otherwise:

- **`colota_export`** - the marker that lets Colota recognise its own files when enforcing retention. Without it, cleanup could not tell your files from its own. Matching is **case-sensitive**, so `Colota_Export` is not accepted.
- **`{date}` and `{time}`** - together they keep each export uniquely named and let Colota order files chronologically no matter where the timestamp sits in the name.

Other notes:

- The file extension is appended automatically from the selected format. Do not put it in the template.
- Characters that filesystems or sync clients reject (`\ / : * ? " < > |`) are removed, as are leading and trailing dots and spaces.
- Templates longer than 100 characters are rejected, and `{device}` is shortened to 32 characters, so the result stays inside the filesystem's name limit.
- If a file of the same name already exists, Android adds a counter (`… (1).gpx`). Colota still recognises those as its own.

Manual **Export Locations** and trip exports are unaffected. Those go through the Android share sheet, where you name the file yourself.

## Storage Reference

- ~200 bytes per location
- ~2 MB per 10,000 locations
