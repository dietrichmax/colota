import { isEndpointAllowed, isPositiveInt, parsePositiveInt } from "../settingsValidation"

describe("isEndpointAllowed", () => {
  it("allows valid http and https URLs", () => {
    expect(isEndpointAllowed("https://example.com/api")).toBe(true)
    expect(isEndpointAllowed("http://192.168.1.1/api")).toBe(true)
  })

  it("rejects empty string", () => {
    expect(isEndpointAllowed("")).toBe(false)
  })

  it("rejects URLs without protocol", () => {
    expect(isEndpointAllowed("example.com/api")).toBe(false)
  })

  it("rejects non-HTTP protocols", () => {
    expect(isEndpointAllowed("ftp://example.com")).toBe(false)
    expect(isEndpointAllowed("ws://example.com")).toBe(false)
  })
})

describe("isPositiveInt", () => {
  it("accepts integers >= 1", () => {
    expect(isPositiveInt("1")).toBe(true)
    expect(isPositiveInt("15")).toBe(true)
    expect(isPositiveInt("999")).toBe(true)
  })

  it("rejects 0 and negatives", () => {
    expect(isPositiveInt("0")).toBe(false)
    expect(isPositiveInt("-5")).toBe(false)
  })

  it("rejects empty and non-numeric input", () => {
    expect(isPositiveInt("")).toBe(false)
    expect(isPositiveInt("abc")).toBe(false)
  })
})

describe("parsePositiveInt", () => {
  it("returns the parsed value when valid", () => {
    expect(parsePositiveInt("5", 99)).toBe(5)
    expect(parsePositiveInt("1", 99)).toBe(1)
  })

  it("returns the fallback when invalid", () => {
    expect(parsePositiveInt("0", 10)).toBe(10)
    expect(parsePositiveInt("", 10)).toBe(10)
    expect(parsePositiveInt("abc", 10)).toBe(10)
  })

  it("truncates floats via parseInt", () => {
    expect(parsePositiveInt("5.9", 99)).toBe(5)
  })
})
