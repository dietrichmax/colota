import { zoneRowSub } from "../geofenceRow"
import type { Geofence } from "../../types/global"

jest.mock("../geo", () => ({
  formatShortDistance: (m: number) => `${m}m`
}))

const zone = (overrides: Partial<Geofence> = {}): Geofence => ({
  id: 1,
  name: "Home",
  lat: 48.1,
  lon: 11.5,
  radius: 50,
  enabled: true,
  pauseTracking: true,
  pauseOnWifi: false,
  pauseOnMotionless: false,
  motionlessTimeoutMinutes: 5,
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: 15,
  ...overrides
})

describe("zoneRowSub", () => {
  it("names the radius and every pause mode that is on, so the row says what the zone does", () => {
    expect(zoneRowSub(zone({ pauseOnWifi: true, pauseOnMotionless: true }), false)).toBe(
      "50m · WiFi pause · motionless pause"
    )
    expect(zoneRowSub(zone({ pauseOnWifi: true }), false)).toBe("50m · WiFi pause")
    expect(zoneRowSub(zone(), false)).toBe("50m")
  })

  it("says recording continues when the master switch is off, since the modes do nothing then", () => {
    expect(zoneRowSub(zone({ pauseTracking: false, pauseOnWifi: true, pauseOnMotionless: true }), false)).toBe(
      "50m · recording continues"
    )
  })

  it("leads with Paused here for the zone you stand in, so the state survives an ellipsis", () => {
    expect(zoneRowSub(zone({ pauseOnWifi: true }), true)).toBe("Paused here · 50m · WiFi pause")
  })
})
