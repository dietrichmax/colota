import {
  autoExportRowSub,
  dataRowSub,
  exportFormatsSub,
  getVariantLabel,
  importFormatsSub,
  loggingRowSub,
  offlineMapsRowSub
} from "../settingsRow"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER } from "../fileFormats"

const area = (name: string, sizeBytes: number | null) => ({ name, sizeBytes, isComplete: true, isActive: false })

describe("offlineMapsRowSub", () => {
  it("counts the areas and sums what they take on disk", () => {
    expect(offlineMapsRowSub([area("Munich", 42 * 1024 * 1024), area("Alps", 76 * 1024 * 1024)])).toBe(
      "2 areas · 118.0 MB"
    )
    expect(offlineMapsRowSub([area("Munich", 42 * 1024 * 1024)])).toBe("1 area · 42.0 MB")
  })

  it("falls back to the count when no pack reports a size, since sizeBytes is nullable", () => {
    expect(offlineMapsRowSub([area("Munich", null), area("Alps", null)])).toBe("2 areas")
  })

  it("says none rather than a zero", () => {
    expect(offlineMapsRowSub([])).toBe("No saved areas")
  })
})

describe("autoExportRowSub", () => {
  const status = { enabled: true, interval: "weekly", format: "geojson", lastError: null }

  it("prints the schedule and the format", () => {
    expect(autoExportRowSub(status)).toBe("Weekly · GeoJSON")
  })

  it("adds the failure clause while the last run left an error", () => {
    expect(autoExportRowSub({ ...status, lastError: "Folder not writable" })).toBe(
      "Weekly · GeoJSON · last export failed"
    )
  })

  it("is Off when disabled or unread, never a sentence about the screen", () => {
    expect(autoExportRowSub({ ...status, enabled: false })).toBe("Off")
    expect(autoExportRowSub(null)).toBe("Off")
  })
})

describe("loggingRowSub", () => {
  it("names the size only while the log is being written", () => {
    expect(loggingRowSub(true, 2516582)).toBe("File logging on · 2.4 MB")
    expect(loggingRowSub(false, 2516582)).toBe("File logging off")
  })
})

describe("dataRowSub", () => {
  it("formats exactly as the ledger it opens, two decimals and a grouped count", () => {
    expect(dataRowSub(12480, 3.4213)).toBe("12,480 locations · 3.42 MB")
  })

  it("words the zero rather than printing 0 locations · 0.00 MB", () => {
    expect(dataRowSub(0, 0.02)).toBe("No locations recorded")
  })
})

describe("the format lists", () => {
  it("comes from the shared table, so a new format lands without touching the hub", () => {
    expect(importFormatsSub()).toBe("GeoJSON, GPX, KML, Google Timeline, CSV")
    expect(exportFormatsSub()).toBe("GeoJSON, GPX, KML, CSV")
  })

  it("folds the legacy Timeline parser into its sibling rather than listing one noun twice", () => {
    // Both entries exist in the table and both must reach the row as one word.
    expect(IMPORT_FORMAT_ORDER).toContain("google_timeline_legacy")
    expect(FILE_FORMATS.google_timeline_legacy.label).toBe("Google Timeline (legacy)")
    expect(importFormatsSub().match(/Google Timeline/g)).toHaveLength(1)
  })

  it("lists only what can actually be exported", () => {
    const exportable = IMPORT_FORMAT_ORDER.filter((f) => FILE_FORMATS[f].exportable)
    expect(exportFormatsSub().split(", ")).toHaveLength(exportable.length)
    expect(exportFormatsSub()).not.toContain("Timeline")
  })
})

describe("getVariantLabel", () => {
  it("prints the words the About screen's Variant row prints", () => {
    expect(getVariantLabel("gms")).toBe("Google Play")
    expect(getVariantLabel("foss")).toBe("FOSS")
    expect(getVariantLabel("")).toBe("Unknown")
  })
})
