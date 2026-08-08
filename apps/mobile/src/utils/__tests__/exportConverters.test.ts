import { formatBytes } from "../format"
import {
  EXPORT_FORMAT_KEYS,
  EXPORT_FORMATS,
  DEFAULT_FILENAME_TEMPLATE,
  filenameTokenValues,
  isValidFilenameTemplate,
  renderFilenamePreview
} from "../exportConverters"
import { FILE_FORMATS } from "../fileFormats"

// Trip serialization moved to native ExportConverters.kt; parity is covered by
// the golden-fixture tests in ExportConvertersTest.kt. This file now only covers
// the byte formatter and the export-format metadata registry.

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(500)).toBe("500 B")
    expect(formatBytes(1023)).toBe("1023 B")
  })

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1536)).toBe("1.5 KB")
  })

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB")
    expect(formatBytes(1572864)).toBe("1.5 MB")
  })
})

describe("export format registry", () => {
  it("exportable formats are fully wired for export", () => {
    const exportable = Object.entries(FILE_FORMATS)
      .filter(([, f]) => f.exportable)
      .map(([key]) => key)
      .sort()
    expect(exportable).toEqual([...EXPORT_FORMAT_KEYS].sort())
    EXPORT_FORMAT_KEYS.forEach((key) => {
      expect(EXPORT_FORMATS[key].mimeType).toBeTruthy()
      expect(EXPORT_FORMATS[key].subtitle).toBeTruthy()
    })
  })
})

// These expectations are duplicated in ExportFilenameTest.kt. The preview mirrors the native
// renderer, so any disagreement shows the user a name that never gets written.
describe("renderFilenamePreview", () => {
  const may20 = new Date(2026, 4, 20, 8, 15, 0)

  it("reproduces the pre-template filename for the default template", () => {
    expect(renderFilenamePreview(DEFAULT_FILENAME_TEMPLATE, "geojson", "Pixel 7", may20)).toBe(
      "colota_export_2026-05-20_0815.geojson"
    )
  })

  it("drops whitespace from the device token", () => {
    expect(renderFilenamePreview("{device}_colota_export-{date}_{time}", "gpx", "Pixel 7", may20)).toBe(
      "Pixel7_colota_export-2026-05-20_0815.gpx"
    )
  })

  it("strips illegal characters", () => {
    expect(renderFilenamePreview("a/b:c*colota_export_{date}_{time}", "csv", "Pixel 7", may20)).toBe(
      "abccolota_export_2026-05-20_0815.csv"
    )
  })

  it("strips the braces of unknown tokens", () => {
    expect(renderFilenamePreview("{devcie}_colota_export_{date}_{time}", "geojson", "Pixel 7", may20)).toBe(
      "devcie_colota_export_2026-05-20_0815.geojson"
    )
  })

  it("trims leading and trailing dots and spaces", () => {
    expect(renderFilenamePreview(" .colota_export_{date}_{time}. ", "geojson", "Pixel 7", may20)).toBe(
      "colota_export_2026-05-20_0815.geojson"
    )
  })

  it("does not produce a double dot for a device model ending in a dot", () => {
    expect(renderFilenamePreview("colota_export_{date}_{time}_{device}", "gpx", "Moto G.", may20)).toBe(
      "colota_export_2026-05-20_0815_MotoG.gpx"
    )
  })

  it("caps long device models", () => {
    expect(renderFilenamePreview("{device}_colota_export_{date}_{time}", "geojson", "X".repeat(80), may20)).toBe(
      `${"X".repeat(32)}_colota_export_2026-05-20_0815.geojson`
    )
  })

  it("pads single-digit months, days, hours and minutes", () => {
    expect(renderFilenamePreview(DEFAULT_FILENAME_TEMPLATE, "gpx", "Pixel 7", new Date(2026, 0, 5, 7, 4, 0))).toBe(
      "colota_export_2026-01-05_0704.gpx"
    )
  })
})

describe("filenameTokenValues", () => {
  // The settings hint renders these, so they have to be the same strings the renderer substitutes.
  it("matches what renderFilenamePreview substitutes", () => {
    const now = new Date(2026, 4, 20, 8, 15, 0)
    const { date, time, device } = filenameTokenValues("Pixel 7", now)

    expect(date).toBe("2026-05-20")
    expect(time).toBe("0815")
    expect(device).toBe("Pixel7")
    expect(renderFilenamePreview("{device}_colota_export-{date}_{time}", "gpx", "Pixel 7", now)).toBe(
      `${device}_colota_export-${date}_${time}.gpx`
    )
  })

  it("caps the device value like the renderer does", () => {
    expect(filenameTokenValues("X".repeat(80)).device).toBe("X".repeat(32))
  })
})

describe("isValidFilenameTemplate", () => {
  it("requires the marker and both time tokens", () => {
    expect(isValidFilenameTemplate(DEFAULT_FILENAME_TEMPLATE)).toBe(true)
    expect(isValidFilenameTemplate("{device}_colota_export-{date}_{time}")).toBe(true)
    expect(isValidFilenameTemplate("backup_{date}_{time}")).toBe(false)
    expect(isValidFilenameTemplate("colota_export_{time}")).toBe(false)
    expect(isValidFilenameTemplate("colota_export_{date}")).toBe(false)
  })

  it("is case-sensitive on the marker", () => {
    expect(isValidFilenameTemplate("Colota_Export_{date}_{time}")).toBe(false)
  })

  it("rejects a template that would overrun the filename limit", () => {
    expect(isValidFilenameTemplate("x".repeat(120) + "colota_export_{date}_{time}")).toBe(false)
  })
})
