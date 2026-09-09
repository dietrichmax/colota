import { dataRowSub, getVariantLabel, loggingRowSub, offlineMapsRowSub } from "../settingsRow"

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

describe("getVariantLabel", () => {
  it("prints the words the About screen's Variant row prints", () => {
    expect(getVariantLabel("gms")).toBe("Google Play")
    expect(getVariantLabel("foss")).toBe("FOSS")
    expect(getVariantLabel("")).toBe("Unknown")
  })
})
