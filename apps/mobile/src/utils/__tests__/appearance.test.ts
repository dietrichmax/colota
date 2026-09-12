jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getBuildConfig: () => ({ APP_LANGUAGE: "en-GB" }) }
}))

import { MAP_STYLE_URL_LIGHT } from "../../constants"
import { formatTimeIn } from "../geo"
import { appearanceRowSub, clockSample, isStyleUrlValid, tileRowSub, unitNotation } from "../appearance"

describe("unitNotation", () => {
  it("names distance, speed and elevation, in the order the app prints them", () => {
    expect(unitNotation("metric")).toBe("km · km/h · m")
    expect(unitNotation("imperial")).toBe("mi · mph · ft")
  })
})

describe("clockSample", () => {
  const noon = new Date("2026-09-09T14:05:00Z")

  it("shows the current time in the format being offered", () => {
    expect(clockSample("24h", noon)).toBe(formatTimeIn(Math.floor(noon.getTime() / 1000), "24h"))
    expect(clockSample("12h", noon)).toBe(formatTimeIn(Math.floor(noon.getTime() / 1000), "12h"))
  })

  it("differs between the two formats", () => {
    expect(clockSample("24h", noon)).not.toBe(clockSample("12h", noon))
  })
})

describe("tileRowSub", () => {
  it("names the default host when nothing is stored", () => {
    expect(tileRowSub("", "")).toBe("maps.mxd.codes")
    expect(MAP_STYLE_URL_LIGHT).toContain("maps.mxd.codes")
  })

  it("names one host when both styles come from it", () => {
    expect(tileRowSub("https://tiles.example.org/l.json", "https://tiles.example.org/d.json")).toBe("tiles.example.org")
  })

  it("names both when they differ, since one name would hide half the answer", () => {
    expect(tileRowSub("https://a.example.org/l.json", "https://b.example.org/d.json")).toBe(
      "a.example.org · b.example.org"
    )
  })

  it("falls back per field, so filling one leaves the other on the default", () => {
    expect(tileRowSub("https://a.example.org/l.json", "")).toBe("a.example.org · maps.mxd.codes")
  })
})

describe("isStyleUrlValid", () => {
  it("accepts an empty value as a return to the default", () => {
    expect(isStyleUrlValid("")).toBe(true)
    expect(isStyleUrlValid("   ")).toBe(true)
  })

  it("accepts either scheme, because a tile server on a LAN is a real case", () => {
    expect(isStyleUrlValid("https://tiles.example.org/style.json")).toBe(true)
    expect(isStyleUrlValid("http://192.168.1.20:8080/style.json")).toBe(true)
  })

  it("refuses what MapLibre could never load", () => {
    expect(isStyleUrlValid("htps://tiles.example.org")).toBe(false)
    expect(isStyleUrlValid("tiles.example.org")).toBe(false)
    expect(isStyleUrlValid("asset://style.json")).toBe(false)
  })
})

describe("appearanceRowSub", () => {
  it("reads back how the app looks and reads", () => {
    expect(appearanceRowSub("dark", "metric", "24h")).toBe("Dark · Metric · 24h")
    expect(appearanceRowSub("system", "imperial", "12h")).toBe("System · Imperial · 12h")
  })

  it("takes every word from the catalog, including the clock", () => {
    expect(appearanceRowSub("light", "metric", "12h")).not.toContain("timeFormat")
    expect(appearanceRowSub("light", "metric", "12h")).toContain("12h")
  })

  it("adds the tile host only once a custom style is stored", () => {
    expect(appearanceRowSub("dark", "metric", "24h", "", "")).toBe("Dark · Metric · 24h")
    expect(appearanceRowSub("dark", "metric", "24h", "https://a.example.org/l.json", "")).toBe(
      "Dark · Metric · 24h · a.example.org · maps.mxd.codes"
    )
  })
})
