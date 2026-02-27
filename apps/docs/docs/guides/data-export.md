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

## Storage Reference

- ~200 bytes per location
- ~2 MB per 10,000 locations
