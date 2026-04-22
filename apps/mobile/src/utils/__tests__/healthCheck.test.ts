import { resolveHealthUrls } from "../healthCheck"

describe("resolveHealthUrls", () => {
  it("traccar: primary is port 8082/api/server, fallback is origin", () => {
    expect(resolveHealthUrls("http://192.168.1.1:5055", "traccar")).toEqual([
      "http://192.168.1.1:8082/api/server",
      "http://192.168.1.1:8082"
    ])
  })

  it("dawarich: primary is /api/v1/health, fallback is origin", () => {
    expect(resolveHealthUrls("https://dawarich.example.com:3000/api/v1/points", "dawarich")).toEqual([
      "https://dawarich.example.com:3000/api/v1/health",
      "https://dawarich.example.com:3000"
    ])
  })

  it("owntracks: tries /api/0/version then origin", () => {
    expect(resolveHealthUrls("http://owntracks.local/pub", "owntracks")).toEqual([
      "http://owntracks.local/api/0/version",
      "http://owntracks.local"
    ])
  })

  it("phonetrack: primary is /status.php, fallback is origin", () => {
    expect(resolveHealthUrls("https://nextcloud.example.com/apps/phonetrack", "phonetrack")).toEqual([
      "https://nextcloud.example.com/status.php",
      "https://nextcloud.example.com"
    ])
  })

  it("geopulse: tries /api/health then origin", () => {
    expect(resolveHealthUrls("http://geopulse.local/ingest", "geopulse")).toEqual([
      "http://geopulse.local/api/health",
      "http://geopulse.local"
    ])
  })

  it("reitti: tries /health then origin", () => {
    expect(resolveHealthUrls("http://reitti.local/api/locations", "reitti")).toEqual([
      "http://reitti.local/health",
      "http://reitti.local"
    ])
  })

  it("custom: tries /health then origin regardless of endpoint path", () => {
    expect(resolveHealthUrls("https://custom.example.com/track", "custom")).toEqual([
      "https://custom.example.com/health",
      "https://custom.example.com"
    ])
  })

  it("returns only endpoint on invalid URL", () => {
    expect(resolveHealthUrls("not-a-url", "custom")).toEqual(["not-a-url"])
  })
})
