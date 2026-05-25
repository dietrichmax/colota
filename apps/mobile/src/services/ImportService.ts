/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { NativeModules } from "react-native"

const { ImportServiceModule } = NativeModules

export type ImportFormat = "geojson" | "google_timeline_legacy" | "google_timeline_new" | "gpx" | "kml" | "csv"

export type ImportSource = {
  uri: string
  displayName: string | null
}

export type ImportPreview = {
  format: ImportFormat
  totalParsed: number
  invalid: number
  duplicates: number
  newRows: number
  dateRangeStartSec: number | null
  dateRangeEndSec: number | null
  canQueueForSync: boolean
}

class ImportService {
  private static ensureModule(): void {
    if (!ImportServiceModule) {
      throw new Error("[ImportService] ImportServiceModule not available. Check native linking.")
    }
  }

  static async pickImportSource(): Promise<ImportSource | null> {
    ImportService.ensureModule()
    return ImportServiceModule.pickImportSource()
  }

  static async importLocationsFromFile(uri: string): Promise<ImportPreview> {
    ImportService.ensureModule()
    return ImportServiceModule.importLocationsFromFile(uri)
  }

  static async commitImport(asQueued: boolean = false): Promise<number> {
    ImportService.ensureModule()
    return ImportServiceModule.commitImport(asQueued)
  }

  static async cancelImport(): Promise<void> {
    ImportService.ensureModule()
    await ImportServiceModule.cancelImport()
  }
}

export default ImportService
