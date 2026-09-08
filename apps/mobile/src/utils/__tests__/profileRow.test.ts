import { conditionText, describeProfileState, profileRowSub, profileSentence, recordingClause } from "../profileRow"
import { loadDisplayPreferences } from "../geo"
import type { SavedTrackingProfile } from "../../types/global"

const mockGetSetting = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getSetting: (...args: string[]) => mockGetSetting(...args) }
}))

const units = async (system: "metric" | "imperial") => {
  mockGetSetting.mockImplementation((key: string) => Promise.resolve(key === "unitSystem" ? system : ""))
  await loadDisplayPreferences()
}

beforeAll(() => units("metric"))

const profile = (overrides: Partial<SavedTrackingProfile>): SavedTrackingProfile => ({
  id: 1,
  name: "Commute",
  interval: 5,
  distance: 0,
  syncInterval: 0,
  priority: 10,
  condition: { type: "charging" },
  activationDelay: 0,
  deactivationDelay: 60,
  enabled: true,
  ...overrides
})
const commute = profile({})
const driving = profile({
  id: 2,
  name: "Driving",
  interval: 2,
  distance: 10,
  syncInterval: 60,
  condition: { type: "speed_above", speedThreshold: 13.89 }
})
const resting = profile({
  id: 3,
  name: "Resting",
  interval: 60,
  distance: 0,
  syncInterval: 300,
  condition: { type: "stationary" }
})
const car = profile({
  id: 4,
  name: "Car",
  interval: 10,
  distance: 5,
  syncInterval: 300,
  condition: { type: "android_auto" }
})
const settings = { interval: 30, distance: 2, syncInterval: 300, isOfflineMode: false }

describe("profileRowSub", () => {
  it("reads as one sentence: condition, recording, sync", () => {
    expect(profileRowSub(commute, false, false)).toBe("When charging · Every 5 s, any movement · syncs each fix")
    expect(profileRowSub(driving, false, false)).toBe("Speed above 50 km/h · Every 2 s after 10 m · syncs every 1 min")
    expect(profileRowSub(car, false, false)).toBe("On Android Auto · Every 10 s after 5 m · syncs every 5 min")
  })

  it("opens with Active and lower-cases the condition for the row in force", () => {
    expect(profileRowSub(commute, true, false)).toBe(
      "Active · when charging · Every 5 s, any movement · syncs each fix"
    )
    expect(profileRowSub(driving, true, false)).toBe(
      "Active · speed above 50 km/h · Every 2 s after 10 m · syncs every 1 min"
    )
  })

  it("says while still for a stationary profile, since its distance is forced to 0", () => {
    expect(profileRowSub(resting, false, false)).toBe("When stationary · Every 1 min while still · syncs every 5 min")
    expect(recordingClause(resting)).toBe("Every 1 min while still")
  })

  it("drops the sync clause in offline mode", () => {
    expect(profileRowSub(commute, false, true)).toBe("When charging · Every 5 s, any movement")
  })

  it("prints the speed in the user's unit", async () => {
    await units("imperial")
    expect(conditionText(driving)).toBe("Speed above 31 mph")
    expect(profileRowSub(driving, false, false)).toBe("Speed above 31 mph · Every 2 s after 33 ft · syncs every 1 min")
    await units("metric")
  })
})

describe("profileSentence", () => {
  it("is the rule the editor reads back", () => {
    expect(profileSentence(commute, false)).toBe("When charging, track every 5 s, any movement and sync each fix.")
    expect(profileSentence(driving, false)).toBe(
      "When faster than 50 km/h, track every 2 s after 10 m and sync every 1 min."
    )
    expect(profileSentence(resting, false)).toBe("When stationary, track every 1 min while still and sync every 5 min.")
    expect(profileSentence({ ...driving, condition: { type: "speed_below", speedThreshold: 2.78 } }, false)).toBe(
      "When slower than 10 km/h, track every 2 s after 10 m and sync every 1 min."
    )
  })

  it("stops after the recording clause in offline mode", () => {
    expect(profileSentence(commute, true)).toBe("When charging, track every 5 s, any movement.")
  })
})

describe("describeProfileState", () => {
  it("names the profile in force with its values", () => {
    const s = describeProfileState(driving, settings, true)
    expect(s.tone).toBe("success")
    expect(s.label).toBe("Driving is active")
    expect(s.caption).toBe("In force: every 2 s after 10 m · syncs every 1 min")
  })

  it("gives the default a meaning when tracking runs with no profile", () => {
    const s = describeProfileState(null, settings, true)
    expect(s.tone).toBe("secondary")
    expect(s.label).toBe("No profile active")
    expect(s.caption).toBe("Tracking & sync applies: every 30 s after 2 m · syncs every 5 min")
  })

  it("says profiles wait for tracking rather than inventing a state", () => {
    expect(describeProfileState(driving, settings, false).caption).toBe("Profiles apply while tracking runs")
  })

  it("prints while still for a stationary profile in force", () => {
    expect(describeProfileState(resting, settings, true).caption).toBe(
      "In force: every 1 min while still · syncs every 5 min"
    )
  })
})
