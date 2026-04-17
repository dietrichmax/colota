import { isEndpointAllowed } from "../settingsValidation"

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
