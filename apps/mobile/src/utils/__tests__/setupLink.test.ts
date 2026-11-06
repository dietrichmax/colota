import {
  API_TEMPLATE_NAMES,
  AUTH_TYPES,
  DAWARICH_MODES,
  HTTP_METHODS,
  PROFILE_CONDITION_TYPES,
  buildSetupLinkFromConfig,
  decodeConfig
} from "@colota/shared"
import { buildSetupConfig, buildSetupLink, type SetupShareParts, type SetupShareSelection } from "../setupLink"
import { validateConfig, setupEndpointHost } from "../setupConfig"
import { PROFILE_CONDITIONS } from "../../constants"
import type { Settings, AuthConfig, Geofence, TrackingProfile } from "../../types/global"

const settings = {
  interval: 10,
  distance: 5,
  filterInaccurateLocations: true,
  accuracyThreshold: 50,
  accuracyMode: "balanced",
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
    accuracyThreshold: 200,
    enabled: true,
    createdAt: 456
  },
  {
    id: 3,
    name: "Home",
    interval: 300,
    distance: 10,
    syncInterval: 300,
    priority: 15,
    condition: { type: "wifi_ssid", ssid: "HomeNet" },
    activationDelay: 0,
    deactivationDelay: 60,
    accuracyThreshold: null,
    enabled: true,
    createdAt: 789
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
    expect(result.config.settings.accuracyMode).toBe("balanced")
    expect(result.config.settings.syncInterval).toBe(0)
    expect(result.config.settings.endpoint).toBe("https://example.com/api")
    // The import screen finds the endpoint by this id to give it its own block; the label translates.
    expect(result.entries.find((e) => e.field === "endpoint")?.value).toBe("https://example.com/api")
    expect(result.config.settings.apiTemplate).toBe("custom")
    expect(result.config.settings.fieldMap).toEqual({ lat: "latitude" })
    // credentials map authType -> type and keep secrets + headers
    expect(result.config.auth?.authType).toBe("basic")
    expect(result.config.auth?.password).toBe("secret")
    expect(result.config.auth?.customHeaders).toEqual({ "X-Api-Key": "abc" })
    // collections, with DB-only fields stripped
    expect(result.config.geofences).toHaveLength(1)
    expect(result.config.geofences[0].name).toBe("Home")
    expect(result.config.profiles).toHaveLength(2)
    expect(result.config.profiles[0].condition).toEqual({ type: "speed_above", speedThreshold: 8.33 })
    // The network name has to survive the share; the import screen rejects the profile without it.
    expect(result.config.profiles[1].condition).toEqual({ type: "wifi_ssid", ssid: "HomeNet" })
    expect(result.config.profiles[1]).not.toHaveProperty("id")
    expect(result.config.profiles[0].accuracyThreshold).toBe(200)
    expect(result.config.profiles[1].accuracyThreshold).toBeNull()
  })

  it("leaves a profile without its own accuracy threshold out of the link, which keeps the QR code small", () => {
    const config = buildSetupConfig(parts, ALL) as { profiles: Record<string, unknown>[] }

    expect(config.profiles[0].accuracyThreshold).toBe(200)
    expect(config.profiles[1]).not.toHaveProperty("accuracyThreshold")
  })

  it("imports a profile's accuracy threshold only as whole metres the editor accepts, anything else follows the global filter", () => {
    const base = { name: "P", interval: 5, distance: 0, syncInterval: 0, condition: { type: "charging" } }
    const thresholdOf = (accuracyThreshold: unknown) =>
      validateConfig({ profiles: [{ ...base, accuracyThreshold }] }).config.profiles[0].accuracyThreshold

    expect(thresholdOf(150)).toBe(150)
    expect(thresholdOf(0)).toBeNull()
    expect(thresholdOf(0.5)).toBeNull()
    expect(thresholdOf(12.5)).toBeNull()
    expect(thresholdOf(-5)).toBeNull()
    expect(thresholdOf("150")).toBeNull()
    expect(thresholdOf(undefined)).toBeNull()
  })

  it("reads a valid positioning accuracy mode and rejects anything else", () => {
    expect(validateConfig({ interval: 10, accuracyMode: "balanced" }).config.settings.accuracyMode).toBe("balanced")
    expect(validateConfig({ interval: 10, accuracyMode: "high" }).config.settings.accuracyMode).toBe("high")

    // Strict, like the sibling enum fields: the value is app-generated, so casing, whitespace and type all lose.
    expect(validateConfig({ interval: 10, accuracyMode: "turbo" }).config.settings.accuracyMode).toBeUndefined()
    expect(validateConfig({ interval: 10, accuracyMode: 1 }).config.settings.accuracyMode).toBeUndefined()
    expect(validateConfig({ interval: 10, accuracyMode: null }).config.settings.accuracyMode).toBeUndefined()
    expect(validateConfig({ interval: 10, accuracyMode: " Balanced " }).config.settings.accuracyMode).toBeUndefined()

    const entry = validateConfig({ interval: 10, accuracyMode: "balanced" }).entries.find(
      (e) => e.field === "accuracyMode"
    )
    expect(entry).toMatchObject({ field: "accuracyMode", category: "tracking" })

    // An invalid mode alone is not a setting, so the link carries nothing to apply.
    expect(validateConfig({ accuracyMode: "turbo" }).valid).toBe(false)
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
    const encoded = buildSetupLinkFromConfig(config).split("config=")[1]
    const asReceived = encoded.replace(/\+/g, " ")
    expect(asReceived).not.toBe(encoded) // proves the payload's base64 actually contained a '+'
    expect(decodeConfig(asReceived)).toEqual(config)
  })
})

// The docs generator offers these lists as its options, so each value must import and anything else must drop.
describe("shared setup schema", () => {
  it("imports every value the schema lists for an enum key and drops any other", () => {
    for (const apiTemplate of API_TEMPLATE_NAMES) {
      expect(validateConfig({ apiTemplate }).config.settings.apiTemplate).toBe(apiTemplate)
    }
    expect(validateConfig({ apiTemplate: "nextcloud" }).config.settings.apiTemplate).toBeUndefined()

    for (const httpMethod of HTTP_METHODS) {
      expect(validateConfig({ httpMethod }).config.settings.httpMethod).toBe(httpMethod)
    }
    expect(validateConfig({ httpMethod: "PUT" }).config.settings.httpMethod).toBeUndefined()

    for (const dawarichMode of DAWARICH_MODES) {
      expect(validateConfig({ dawarichMode }).config.settings.dawarichMode).toBe(dawarichMode)
    }
    expect(validateConfig({ dawarichMode: "stream" }).config.settings.dawarichMode).toBeUndefined()

    for (const type of AUTH_TYPES) {
      expect(validateConfig({ auth: { type } }).config.auth?.authType).toBe(type)
    }
    expect(validateConfig({ auth: { type: "digest" } }).config.auth).toBeNull()

    const profile = { name: "P", interval: 5, distance: 0, syncInterval: 0, condition: { type: "on_battery" } }
    expect(validateConfig({ profiles: [profile] }).config.profiles).toEqual([])
  })

  it("has an app condition for every profile condition a link can carry, so an imported profile can be shown", () => {
    expect(PROFILE_CONDITIONS.map((c) => c.type).sort()).toEqual([...PROFILE_CONDITION_TYPES].sort())
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
