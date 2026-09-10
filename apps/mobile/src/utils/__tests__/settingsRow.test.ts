import { buildLine, dataRowSub, getVariantLabel, loggingRowSub, offlineMapsRowSub, versionLine } from "../settingsRow"

const area = (name: string, sizeBytes: number | null) => ({
  name,
  sizeBytes,
  isComplete: true,
  isActive: false,
  bounds: null
})

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

describe("loggingRowSub", () => {
  it("names the size while the log is being written", () => {
    expect(loggingRowSub(true, 2516582)).toBe("File logging on · 2.4 MB")
  })

  /**
   * Switching the toggle off stops writing and deletes nothing. A bare "File logging off" over
   * megabytes of named-zone and profile history reads as though the file went with the switch.
   */
  it("still says what is on disk after the switch goes off", () => {
    expect(loggingRowSub(false, 2516582)).toBe("File logging off · 2.4 MB kept")
    expect(loggingRowSub(false, 0)).toBe("File logging off")
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

describe("getVariantLabel", () => {
  it("names each flavor as the About row and the About screen print it after the version", () => {
    expect(getVariantLabel("gms")).toBe("Google Play")
    expect(getVariantLabel("foss")).toBe("FOSS")
    expect(getVariantLabel("")).toBe("Unknown")
  })
})

const gms = { VERSION_NAME: "1.16.0", VERSION_CODE: 48, FLAVOR: "gms" }
const foss = { VERSION_NAME: "1.16.0", VERSION_CODE: 48, FLAVOR: "foss" }

describe("versionLine", () => {
  it("is the hub's About row, version and flavor", () => {
    expect(versionLine(gms)).toBe("1.16.0 · Google Play")
    expect(versionLine(foss)).toBe("1.16.0 · FOSS")
  })

  // A missing bridge module used to print "Version  · Unknown" on the hub.
  it("says Unknown for a build module that did not link", () => {
    expect(versionLine(null)).toBe("Unknown")
  })
})

describe("buildLine", () => {
  // Play's crash reports, F-Droid and changelogs/<code>.txt are keyed by the code, and 1.8.0
  // shipped under both 36 and 37.
  it("is the About screen's line, with the version code the release artefacts are keyed by", () => {
    expect(buildLine(gms)).toBe("1.16.0 (48) · Google Play")
    expect(buildLine(foss)).toBe("1.16.0 (48) · FOSS")
    expect(buildLine(null)).toBe("Unknown")
  })

  it("is the row's line with the code inserted, so the two cannot disagree", () => {
    for (const config of [gms, foss]) {
      expect(buildLine(config).replace(" (48)", "")).toBe(versionLine(config))
    }
  })
})
