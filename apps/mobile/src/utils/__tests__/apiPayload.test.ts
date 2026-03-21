import { buildTraccarJsonPayload } from "../apiPayload"

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
