import { isPrivateHost, isEndpointAllowed } from "../settingsValidation"

describe("isPrivateHost", () => {
  describe("private IPs", () => {
    it("detects localhost IP", () => {
      expect(isPrivateHost("127.0.0.1")).toBe(true)
    })

    it("detects 10.x.x.x range", () => {
      expect(isPrivateHost("10.0.0.1")).toBe(true)
      expect(isPrivateHost("10.255.255.255")).toBe(true)
    })

    it("detects 192.168.x.x range", () => {
      expect(isPrivateHost("192.168.1.1")).toBe(true)
      expect(isPrivateHost("192.168.0.100")).toBe(true)
    })

    it("detects 172.16-31.x.x range", () => {
      expect(isPrivateHost("172.16.0.1")).toBe(true)
      expect(isPrivateHost("172.31.255.255")).toBe(true)
    })

    it("detects localhost hostname", () => {
      expect(isPrivateHost("localhost")).toBe(true)
    })
  })

  describe("public IPs and hosts", () => {
    it("rejects public IPs", () => {
      expect(isPrivateHost("8.8.8.8")).toBe(false)
      expect(isPrivateHost("1.1.1.1")).toBe(false)
    })

    it("rejects public hostnames", () => {
      expect(isPrivateHost("google.com")).toBe(false)
      expect(isPrivateHost("example.com")).toBe(false)
    })

    it("rejects 172.32+ (outside private range)", () => {
      expect(isPrivateHost("172.32.0.1")).toBe(false)
    })
  })

  describe("URL handling", () => {
    it("strips http protocol", () => {
      expect(isPrivateHost("http://192.168.1.1")).toBe(true)
    })

    it("strips https protocol", () => {
      expect(isPrivateHost("https://localhost")).toBe(true)
    })

    it("handles URLs with ports", () => {
      expect(isPrivateHost("192.168.1.1:3000")).toBe(true)
      expect(isPrivateHost("http://10.0.0.1:8080")).toBe(true)
    })

    it("handles URLs with paths", () => {
      expect(isPrivateHost("http://192.168.1.1/api/locations")).toBe(true)
    })
  })

  describe("edge cases", () => {
    it("returns false for empty string", () => {
      expect(isPrivateHost("")).toBe(false)
    })
  })
})

describe("isEndpointAllowed", () => {
  describe("HTTPS endpoints", () => {
    it("allows any HTTPS endpoint", () => {
      expect(isEndpointAllowed("https://example.com/api")).toBe(true)
      expect(isEndpointAllowed("https://api.server.io:443/v1")).toBe(true)
    })
  })

  describe("HTTP endpoints", () => {
    it("allows HTTP to private hosts", () => {
      expect(isEndpointAllowed("http://192.168.1.1/api")).toBe(true)
      expect(isEndpointAllowed("http://localhost:3000/locations")).toBe(true)
      expect(isEndpointAllowed("http://10.0.0.1:8080")).toBe(true)
    })

    it("rejects HTTP to public hosts", () => {
      expect(isEndpointAllowed("http://google.com")).toBe(false)
      expect(isEndpointAllowed("http://api.example.com/v1")).toBe(false)
    })
  })

  describe("invalid inputs", () => {
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
})
