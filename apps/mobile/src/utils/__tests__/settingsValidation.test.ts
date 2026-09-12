import {
  endpointCarriesKey,
  endpointExample,
  isEndpointAllowed,
  isPositiveInt,
  parsePositiveInt,
  parseWholeNumber,
  wholeNumberError
} from "../settingsValidation"
import { API_TEMPLATES } from "../../types/global"

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

describe("parseWholeNumber", () => {
  it("accepts only digits, so a decimal, a sign, an exponent or nothing never reaches a setting", () => {
    expect(parseWholeNumber("20")).toBe(20)
    expect(parseWholeNumber("0")).toBe(0)
    expect(parseWholeNumber("1.5")).toBeNull()
    expect(parseWholeNumber("-3")).toBeNull()
    expect(parseWholeNumber("1e3")).toBeNull()
    expect(parseWholeNumber("")).toBeNull()
  })
})

describe("wholeNumberError", () => {
  it("stays silent on an empty field and on a valid value", () => {
    expect(wholeNumberError("", 1, "s")).toBeUndefined()
    expect(wholeNumberError("5", 1, "s")).toBeUndefined()
  })

  it("names the rule the text breaks, with the unit the field shows", () => {
    expect(wholeNumberError("1.5", 1, "s")).toBe("A whole number")
    expect(wholeNumberError("0", 1, "m")).toBe("At least 1 m")
  })
})

describe("endpointExample", () => {
  it("hands the field the shape the chosen template expects, and Dawarich's batch path in batch mode", () => {
    expect(endpointExample("custom")).toBe("https://your-server.example/api")
    expect(endpointExample("traccar")).toBe(API_TEMPLATES.traccar.endpointExample)
    expect(endpointExample("dawarich", "single")).toBe(API_TEMPLATES.dawarich.endpointExample)
    expect(endpointExample("dawarich", "batch")).toBe(API_TEMPLATES.dawarich.batchEndpointExample)
  })
})

describe("endpointCarriesKey", () => {
  it("spots a credential in the query string, which settings store in the clear", () => {
    expect(endpointCarriesKey("https://d.example/api?api_key=abc")).toBe(true)
    expect(endpointCarriesKey("https://d.example/api?Token=abc&x=1")).toBe(true)
    expect(endpointCarriesKey("https://d.example/api?device=phone")).toBe(false)
    expect(endpointCarriesKey("https://d.example/api")).toBe(false)
  })
})
