/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Activity, Database, Globe, Map, MapPin, Table2 } from "lucide-react-native"
import type { LucideIcon } from "lucide-react-native"
import type { ImportFormat } from "../services/ImportService"
import type { TranslationKey } from "../i18n/options"
import { t } from "../i18n/t"

// Single source of truth for per-format metadata, shared by the export and import screens.
export interface FileFormat {
  /** A product name, never translated; `legacy` wraps it in the catalog's "(legacy)". */
  label: string
  legacy?: boolean
  icon: LucideIcon
  extension: string
  exportable: boolean
  mimeType?: string // present for every exportable format
  descriptionKey: TranslationKey
}

export const FILE_FORMATS: Record<ImportFormat, FileFormat> = {
  geojson: {
    label: "GeoJSON",
    icon: Globe,
    extension: ".geojson",
    exportable: true,
    mimeType: "application/geo+json",
    descriptionKey: "formats.geojson.description"
  },
  google_timeline_legacy: {
    label: "Google Timeline",
    legacy: true,
    icon: Database,
    extension: "Records.json",
    exportable: false,
    descriptionKey: "formats.google_timeline_legacy.description"
  },
  google_timeline_new: {
    label: "Google Timeline",
    icon: MapPin,
    extension: ".json",
    exportable: false,
    descriptionKey: "formats.google_timeline_new.description"
  },
  gpx: {
    label: "GPX",
    icon: Activity,
    extension: ".gpx",
    exportable: true,
    mimeType: "application/gpx+xml",
    descriptionKey: "formats.gpx.description"
  },
  kml: {
    label: "KML",
    icon: Map,
    extension: ".kml",
    exportable: true,
    mimeType: "application/vnd.google-earth.kml+xml",
    descriptionKey: "formats.kml.description"
  },
  csv: {
    label: "CSV",
    icon: Table2,
    extension: ".csv",
    exportable: true,
    mimeType: "text/csv",
    descriptionKey: "formats.csv.description"
  }
}

export const IMPORT_FORMAT_ORDER: ImportFormat[] = [
  "geojson",
  "gpx",
  "kml",
  "google_timeline_new",
  "google_timeline_legacy",
  "csv"
]

/** The name a format is shown by: the product name, with "(legacy)" from the catalog where it applies. */
export function fileFormatLabel(format: ImportFormat): string {
  const entry = FILE_FORMATS[format]
  return entry.legacy ? t("formats.legacyLabel", { name: entry.label }) : entry.label
}
