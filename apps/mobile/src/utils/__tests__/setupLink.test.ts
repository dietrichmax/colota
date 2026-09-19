import {
  buildSetupConfig,
  buildSetupLink,
  encodeConfig,
  decodeConfig,
  type SetupShareParts,
  type SetupShareSelection
} from "../setupLink"
import { validateConfig, setupEndpointHost } from "../setupConfig"
import type { Settings, AuthConfig, Geofence, TrackingProfile } from "../../types/global"

const settings = {
  interval: 10,
  distance: 5,
  filterInaccurateLocations: true,
  accuracyThreshold: 50,
  endpoint: "https://example.com/api",
  fieldMap: { lat: "latitude" },
  customFields: [{ key: "device", value: "phone" }],
  apiTemplate: "custom",
  httpMethod: "POST",
  dawarichMode: "single",
  overlandBatchSize: 50,
  syncInterval: 0,
  retryInterval: 30,
  isOfflineMode: false,
  syncCondition: "any",
  syncSsid: ""
} as Settings

const auth: AuthConfig = {
  authType: "basic",
  username: "user",
  password: "secret",
  bearerToken: "",
  customHeaders: { "X-Api-Key": "abc" }
}

const geofences: Geofence[] = [
  {
    id: 1,
    name: "Home",
    lat: 52.52,
    lon: 13.405,
    radius: 100,
    enabled: true,
    pauseTracking: true,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutMinutes: 10,
    heartbeatEnabled: false,
    heartbeatIntervalMinutes: 15,
    createdAt: 123
  }
]

const profiles: TrackingProfile[] = [
  {
    id: 2,
    name: "Driving",
    interval: 5,
    distance: 0,
    syncInterval: 0,
    priority: 10,
    condition: { type: "speed_above", speedThreshold: 8.33 },
    activationDelay: 0,
    deactivationDelay: 60,
    enabled: true,
    createdAt: 456
  }
]

const parts: SetupShareParts = { settings, auth, geofences, profiles }
const ALL: SetupShareSelection = {
  tracking: true,
  sync: true,
  api: true,
  credentials: true,
  geofences: true,
  profiles: true
}

describe("setupLink", () => {
  it("produces a config the importer accepts, round-tripping every category", () => {
    const result = validateConfig(buildSetupConfig(parts, ALL))

    expect(result.valid).toBe(true)
    // tracking + sync + api
    expect(result.config.settings.interval).toBe(10)
    expect(result.config.settings.accuracyThreshold).toBe(50)
    expect(result.config.settings.syncInterval).toBe(0)
    expect(result.config.settings.endpoint).toBe("https://example.com/api")
    expect(result.config.settings.apiTemplate).toBe("custom")
    expect(result.config.settings.fieldMap).toEqual({ lat: "latitude" })
    // credentials map authType -> type and keep secrets + headers
    expect(result.config.auth?.authType).toBe("basic")
    expect(result.config.auth?.password).toBe("secret")
    expect(result.config.auth?.customHeaders).toEqual({ "X-Api-Key": "abc" })
    // collections, with DB-only fields stripped
    expect(result.config.geofences).toHaveLength(1)
    expect(result.config.geofences[0].name).toBe("Home")
    expect(result.config.profiles).toHaveLength(1)
    expect(result.config.profiles[0].condition).toEqual({ type: "speed_above", speedThreshold: 8.33 })
  })

  it("omits credentials entirely when that category is unchecked", () => {
    const config = buildSetupConfig(parts, { ...ALL, credentials: false })

    expect(config.auth).toBeUndefined()
    expect(config.customHeaders).toBeUndefined()
    expect(validateConfig(config).config.auth).toBeNull()
  })

  it("includes only the selected category", () => {
    const config = buildSetupConfig(parts, {
      tracking: false,
      sync: false,
      api: false,
      credentials: false,
      geofences: true,
      profiles: false
    })

    expect(Object.keys(config)).toEqual(["geofences"])
    expect(validateConfig(config).valid).toBe(true)
  })

  it("builds a colota://setup link the importer can decode", () => {
    const link = buildSetupLink(parts, ALL)
    expect(link).toMatch(/^colota:\/\/setup\?config=/)
    expect(validateConfig(decodeConfig(link.split("config=")[1])).valid).toBe(true)
  })

  it("decodeConfig restores a '+' that the deep-link query parser turned into a space", () => {
    // The high-byte run guarantees a '+' in the base64 - the char the query parser mangles to a space.
    const config = { pad: "ø".repeat(20), endpoint: "https://example.com/api", interval: 10 }
    const encoded = encodeConfig(config)
    const asReceived = encoded.replace(/\+/g, " ")
    expect(asReceived).not.toBe(encoded) // proves the payload's base64 actually contained a '+'
    expect(decodeConfig(asReceived)).toEqual(config)
  })
})

// The import screen prints this host as the thing the user is trusting, so it has to be the host native sends to.
describe("setupEndpointHost", () => {
  it("reads the authority and keeps the port", () => {
    expect(setupEndpointHost("https://example.com/api")).toBe("example.com")
    expect(setupEndpointHost("http://192.168.1.10:8080/api?x=1")).toBe("192.168.1.10:8080")
  })

  it("ignores an @ in the path, which a looser parser reads as userinfo and reports the wrong host", () => {
    expect(setupEndpointHost("https://evil.example/x@my-server.com")).toBe("evil.example")
  })

  it("gives no host when userinfo or a backslash lets two parsers disagree on it", () => {
    expect(setupEndpointHost("https://my-server.com@evil.example/api")).toBeNull()
    expect(setupEndpointHost("https://my-server.com\\@evil.example/api")).toBeNull()
    expect(setupEndpointHost("https://evil.example\\.my-server.com/api")).toBeNull()
  })

  it("rejects the whole link with such an endpoint, so the settings riding along are not applied either", () => {
    const result = validateConfig({
      endpoint: "https://my-server.com@evil.example/api",
      interval: 10,
      auth: { type: "bearer", bearerToken: "abcdefghijkl" }
    })
    expect(result.valid).toBe(false)
    expect(result.config).toEqual({ settings: {}, auth: null, geofences: [], profiles: [] })
    expect(result.entries).toEqual([])
    expect(result.error).toMatch(/plain host.*Nothing from this link will be applied/)
  })
})
