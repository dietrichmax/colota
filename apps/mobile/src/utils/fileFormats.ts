/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Activity, Database, Globe, Map, MapPin, Table2 } from "lucide-react-native"
import type { LucideIcon } from "lucide-react-native"
import type { ImportFormat } from "../services/ImportService"

// Single source of truth for per-format metadata, shared by the export and import
// screens. `description` is the general blurb shown in both menus;
// `importHint` is an optional import-only caveat appended to
// it on the import screen (where parsing constraints actually matter).
export interface FileFormat {
  label: string
  icon: LucideIcon
  extension: string
  exportable: boolean
  mimeType?: string // present for every exportable format
  subtitle?: string // export picker only
  description: string
  importHint?: string
}

export const FILE_FORMATS: Record<ImportFormat, FileFormat> = {
  geojson: {
    label: "GeoJSON",
    icon: Globe,
    extension: ".geojson",
    exportable: true,
    mimeType: "application/json",
    subtitle: "Geographic Data",
    description: "Mapbox, Leaflet, QGIS. Best for backups - re-imports into Colota without losing data."
  },
  google_timeline_legacy: {
    label: "Google Timeline (legacy)",
    icon: Database,
    extension: "Records.json",
    exportable: false,
    description:
      "Older bulk Location History export from Google Takeout. Google removed this from Takeout in late 2024; use this for archived files."
  },
  google_timeline_new: {
    label: "Google Timeline",
    icon: MapPin,
    extension: ".json",
    exportable: false,
    description: "On-device export from Android Settings -> Location -> Location services -> Timeline."
  },
  gpx: {
    label: "GPX",
    icon: Activity,
    extension: ".gpx",
    exportable: true,
    mimeType: "application/gpx+xml",
    subtitle: "GPS Exchange",
    description: "GPS Exchange Format - Garmin, Strava, sport watches, tracking apps."
  },
  kml: {
    label: "KML",
    icon: Map,
    extension: ".kml",
    exportable: true,
    mimeType: "application/vnd.google-earth.kml+xml",
    subtitle: "Keyhole Markup Language",
    description: "Google Earth, Google Maps, ArcGIS.",
    importHint: "Only timestamped placemarks are read - LineString-only tracks are skipped."
  },
  csv: {
    label: "CSV",
    icon: Table2,
    extension: ".csv",
    exportable: true,
    mimeType: "text/csv",
    subtitle: "Spreadsheet Format",
    description: "Comma-separated table - Excel, Google Sheets, data analysis.",
    importHint: "The header must include latitude, longitude and a time column."
  }
}

export function importDescription(f: FileFormat): string {
  return f.importHint ? `${f.description} ${f.importHint}` : f.description
}

export const IMPORT_FORMAT_ORDER: ImportFormat[] = [
  "geojson",
  "gpx",
  "kml",
  "google_timeline_new",
  "google_timeline_legacy",
  "csv"
]
