import {
  buildOverlandBatchPayload,
  buildTraccarJsonPayload,
  isOverlandFormat,
  isTraccarJsonFormat
} from "../apiPayload"

describe("buildTraccarJsonPayload", () => {
  const baseParams = {
    latitude: 52.12345,
    longitude: -2.12345,
    accuracy: 15,
    altitude: 380,
    speed: 5,
    heading: 180,
    batteryLevel: 0.85,
    isCharging: false,
    deviceId: "my-phone"
  }

  it("produces correct nested structure", () => {
    const result = buildTraccarJsonPayload(baseParams) as any
    expect(result).toHaveProperty("location")
    expect(result).toHaveProperty("device_id", "my-phone")
    expect(result.location).toHaveProperty("coords")
    expect(result.location).toHaveProperty("battery")
    expect(result.location).toHaveProperty("timestamp")
  })

  it("maps coords correctly", () => {
    const result = buildTraccarJsonPayload(baseParams) as any
    expect(result.location.coords.latitude).toBe(52.12345)
    expect(result.location.coords.longitude).toBe(-2.12345)
    expect(result.location.coords.accuracy).toBe(15)
    expect(result.location.coords.altitude).toBe(380)
    expect(result.location.coords.speed).toBe(5)
    expect(result.location.coords.heading).toBe(180)
  })

  it("maps battery correctly", () => {
    const result = buildTraccarJsonPayload(baseParams) as any
    expect(result.location.battery.level).toBe(0.85)
    expect(result.location.battery.is_charging).toBe(false)
  })

  it("sets is_charging true when charging", () => {
    const result = buildTraccarJsonPayload({ ...baseParams, isCharging: true }) as any
    expect(result.location.battery.is_charging).toBe(true)
  })

  it("uses provided timestamp", () => {
    const result = buildTraccarJsonPayload({ ...baseParams, timestamp: "2025-02-12T13:00:00.000Z" }) as any
    expect(result.location.timestamp).toBe("2025-02-12T13:00:00.000Z")
  })

  it("defaults timestamp to current time when not provided", () => {
    const before = new Date().toISOString()
    const result = buildTraccarJsonPayload(baseParams) as any
    const after = new Date().toISOString()
    expect(result.location.timestamp >= before).toBe(true)
    expect(result.location.timestamp <= after).toBe(true)
  })

  it("uses provided device_id", () => {
    const result = buildTraccarJsonPayload({ ...baseParams, deviceId: "colota" }) as any
    expect(result.device_id).toBe("colota")
  })
})

describe("isTraccarJsonFormat", () => {
  it("is true only for traccar template with POST method", () => {
    expect(isTraccarJsonFormat("traccar", "POST")).toBe(true)
    expect(isTraccarJsonFormat("traccar", "GET")).toBe(false)
    expect(isTraccarJsonFormat("dawarich", "POST")).toBe(false)
    expect(isTraccarJsonFormat("custom", "POST")).toBe(false)
  })
})

describe("isOverlandFormat", () => {
  it("is true for dawarich template with batch mode", () => {
    expect(isOverlandFormat("dawarich", "batch")).toBe(true)
    expect(isOverlandFormat("dawarich", "single")).toBe(false)
  })

  it("is true for the overland template regardless of dawarichMode", () => {
    expect(isOverlandFormat("overland", "single")).toBe(true)
    expect(isOverlandFormat("overland", "batch")).toBe(true)
  })

  it("is false for unrelated templates", () => {
    expect(isOverlandFormat("traccar", "batch")).toBe(false)
    expect(isOverlandFormat("custom", "batch")).toBe(false)
    expect(isOverlandFormat("owntracks", "single")).toBe(false)
  })
})

describe("buildOverlandBatchPayload", () => {
  const baseParams = {
    latitude: 51.5,
    longitude: -0.04,
    accuracy: 12,
    altitude: 519,
    speed: 0,
    course: 180.5,
    batteryLevel: 0.85,
    batteryState: "charging" as const,
    deviceId: "my-pixel"
  }

  it("wraps a single feature in locations array", () => {
    const result = buildOverlandBatchPayload(baseParams) as any
    expect(Array.isArray(result.locations)).toBe(true)
    expect(result.locations).toHaveLength(1)
    expect(result.locations[0].type).toBe("Feature")
  })

  it("uses GeoJSON [lon, lat] coordinate order", () => {
    const result = buildOverlandBatchPayload(baseParams) as any
    expect(result.locations[0].geometry.coordinates).toEqual([-0.04, 51.5])
  })

  it("places device_id at envelope level not per Feature", () => {
    const result = buildOverlandBatchPayload(baseParams) as any
    expect(result.device_id).toBe("my-pixel")
    expect(result.locations[0].properties.device_id).toBeUndefined()
  })

  it("maps properties correctly", () => {
    const result = buildOverlandBatchPayload(baseParams) as any
    const props = result.locations[0].properties
    expect(props.horizontal_accuracy).toBe(12)
    expect(props.altitude).toBe(519)
    expect(props.speed).toBe(0)
    expect(props.course).toBe(180.5)
    expect(props.battery_level).toBe(0.85)
    expect(props.battery_state).toBe("charging")
  })

  it("uses provided timestamp", () => {
    const result = buildOverlandBatchPayload({ ...baseParams, timestamp: "2026-05-09T12:34:56Z" }) as any
    expect(result.locations[0].properties.timestamp).toBe("2026-05-09T12:34:56Z")
  })
})
