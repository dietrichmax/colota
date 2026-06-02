/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { type LucideIcon } from "lucide-react-native"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER } from "./fileFormats"

// Trip-aware serialization lives natively in ExportConverters.kt (convertTrips,
// reached via NativeLocationService.exportTripsToFile). This module now only
// holds the UI-facing export-format metadata.

export type ExportFormat = "csv" | "geojson" | "gpx" | "kml"

export const EXPORT_FORMAT_KEYS: ExportFormat[] = IMPORT_FORMAT_ORDER.filter(
  (k) => FILE_FORMATS[k].exportable
) as ExportFormat[]

export interface ExportFormatConfig {
  label: string
  subtitle: string
  description: string
  icon: LucideIcon
  extension: string
  mimeType: string
}

export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatConfig> = EXPORT_FORMAT_KEYS.reduce(
  (acc, key) => {
    const f = FILE_FORMATS[key]
    acc[key] = {
      label: f.label,
      subtitle: f.subtitle!,
      description: f.description,
      icon: f.icon,
      extension: f.extension,
      mimeType: f.mimeType!
    }
    return acc
  },
  {} as Record<ExportFormat, ExportFormatConfig>
)
