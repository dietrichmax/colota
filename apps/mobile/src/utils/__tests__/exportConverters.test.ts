import { formatBytes } from "../format"
import { EXPORT_FORMAT_KEYS, EXPORT_FORMATS } from "../exportConverters"
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
