import {
  describeState,
  formatInterval,
  formatLastFix,
  intervalText,
  pickBannerCondition,
  type StateInput
} from "../dashboardState"
import { formatDate, formatTime, loadDisplayPreferences } from "../geo"

const mockGetSetting = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: (...args: string[]) => mockGetSetting(...args)
  }
}))

beforeAll(async () => {
  mockGetSetting.mockImplementation((key: string) => {
    if (key === "unitSystem") return Promise.resolve("metric")
    if (key === "timeFormat") return Promise.resolve("24h")
    return Promise.resolve("")
  })
  await loadDisplayPreferences()
})

const NOW = new Date(2026, 1, 28, 12, 0, 0)
const TODAY_AT_18_42 = Math.floor(new Date(2026, 1, 28, 18, 42, 0).getTime() / 1000)
const YESTERDAY_AT_18_42 = Math.floor(new Date(2026, 1, 27, 18, 42, 0).getTime() / 1000)

const granted = { location: true, background: true }

describe("pickBannerCondition", () => {
  const calm = { permissions: granted, locationEnabled: true, isBatteryCritical: false, tracking: false }

  it("shows nothing when every prerequisite holds", () => {
    expect(pickBannerCondition(calm)).toBeNull()
    expect(pickBannerCondition({ ...calm, tracking: true })).toBeNull()
  })

  it("a missing location grant outranks everything else because nothing can record without it", () => {
    expect(
      pickBannerCondition({
        permissions: { location: false, background: false },
        locationEnabled: false,
        isBatteryCritical: true,
        tracking: true
      })
    ).toBe("permission")
  })

  it("a missing background grant matters only while the service is running", () => {
    const partial = { ...calm, permissions: { location: true, background: false } }
    expect(pickBannerCondition({ ...partial, tracking: true })).toBe("background")
    expect(pickBannerCondition({ ...partial, tracking: false })).toBeNull()
  })

  it("a missing background grant outranks location services being off", () => {
    expect(
      pickBannerCondition({
        permissions: { location: true, background: false },
        locationEnabled: false,
        isBatteryCritical: false,
        tracking: true
      })
    ).toBe("background")
  })

  it("location services off outranks a critical battery", () => {
    expect(pickBannerCondition({ ...calm, locationEnabled: false, isBatteryCritical: true })).toBe("locationOff")
  })

  it("a critical battery only blocks a start, so it is silent while tracking", () => {
    expect(pickBannerCondition({ ...calm, isBatteryCritical: true })).toBe("battery")
    expect(pickBannerCondition({ ...calm, isBatteryCritical: true, tracking: true })).toBeNull()
  })

  it("an unread permission status never claims a grant is missing", () => {
    expect(pickBannerCondition({ ...calm, permissions: null })).toBeNull()
    expect(pickBannerCondition({ ...calm, permissions: null, locationEnabled: false })).toBe("locationOff")
  })
})

describe("describeState", () => {
  const idle: StateInput = {
    tracking: false,
    hasFix: false,
    locationEnabled: true,
    activeZoneName: null,
    pauseReason: null,
    activeProfileName: null,
    coords: null,
    lastKnown: null,
    stoppedByBattery: false,
    now: NOW
  }
  const live: StateInput = {
    ...idle,
    tracking: true,
    hasFix: true,
    coords: { accuracy: 4.3, timestamp: TODAY_AT_18_42 }
  }

  it("idle with a fix from today tells the user when they were last seen", () => {
    expect(describeState({ ...idle, lastKnown: { timestamp: TODAY_AT_18_42 } })).toEqual({
      icon: "dashed",
      tone: "secondary",
      label: "Ready",
      caption: `Last fix ${formatTime(TODAY_AT_18_42)}`
    })
  })

  it("idle with an older fix adds the date so the time is not mistaken for today", () => {
    expect(describeState({ ...idle, lastKnown: { timestamp: YESTERDAY_AT_18_42 } }).caption).toBe(
      `Last fix ${formatDate(YESTERDAY_AT_18_42)} · ${formatTime(YESTERDAY_AT_18_42)}`
    )
  })

  it("a fresh install is Ready with no fix to report", () => {
    expect(describeState(idle)).toEqual({ icon: "dashed", tone: "secondary", label: "Ready", caption: "No fixes yet" })
  })

  it("a battery stop stays visible after the banner clears so the user knows why recording ended", () => {
    expect(describeState({ ...idle, stoppedByBattery: true, lastKnown: { timestamp: TODAY_AT_18_42 } })).toEqual({
      icon: "alert",
      tone: "error",
      label: "Tracking stopped",
      caption: "Battery fell below 5%"
    })
  })

  it("a battery stop is forgotten once tracking runs again", () => {
    expect(describeState({ ...live, stoppedByBattery: true }).label).toBe("Tracking")
  })

  it("tracking without a fix is searching, not an error", () => {
    expect(describeState({ ...idle, tracking: true })).toEqual({
      icon: "loader",
      tone: "primary",
      label: "Searching for GPS",
      caption: "No fix yet"
    })
  })

  it("searching with location services off names the cause the banner offers to fix", () => {
    expect(describeState({ ...idle, tracking: true, locationEnabled: false }).caption).toBe("Location services are off")
  })

  it("a fix flag without coordinates has nothing to print, so it still reads as searching", () => {
    expect(describeState({ ...idle, tracking: true, hasFix: true }).label).toBe("Searching for GPS")
  })

  it("a live fix leads with accuracy and time in the user's units", () => {
    expect(describeState(live)).toEqual({
      icon: "circleDot",
      tone: "success",
      label: "Tracking",
      caption: `±4 m · ${formatTime(TODAY_AT_18_42)}`
    })
  })

  it("an active profile is named on the label so the user sees what is overriding their settings", () => {
    expect(describeState({ ...live, activeProfileName: "Night" }).label).toBe("Tracking · Night")
  })

  it("a WiFi pause names the network the zone is bound to", () => {
    expect(describeState({ ...live, activeZoneName: "Home", pauseReason: "wifi" })).toEqual({
      icon: "pause",
      tone: "secondary",
      label: "Paused in Home",
      caption: "Home WiFi · resumes when you leave"
    })
  })

  it("a motionless pause says movement, not leaving, ends it", () => {
    expect(describeState({ ...live, activeZoneName: "Home", pauseReason: "motionless" }).caption).toBe(
      "No movement · resumes when you move"
    )
  })

  it("a plain zone pause says leaving the zone ends it", () => {
    expect(describeState({ ...live, activeZoneName: "Work", pauseReason: null }).caption).toBe(
      "Inside zone · resumes when you leave"
    )
  })

  it("a pause outranks the live fix because recording is what the user cares about", () => {
    expect(describeState({ ...live, activeZoneName: "Home", activeProfileName: "Night" }).label).toBe("Paused in Home")
  })
})

describe("formatInterval", () => {
  it("keeps sub-minute intervals in seconds", () => {
    expect(formatInterval(5)).toBe("Every 5 s")
    expect(formatInterval(30)).toBe("Every 30 s")
  })

  it("promotes whole minutes so 300 does not have to be divided in the head", () => {
    expect(formatInterval(60)).toBe("Every 1 min")
    expect(formatInterval(300)).toBe("Every 5 min")
  })

  it("promotes whole hours", () => {
    expect(formatInterval(3600)).toBe("Every 1 h")
    expect(formatInterval(7200)).toBe("Every 2 h")
  })

  it("falls back to seconds when neither unit divides evenly, so nothing is rounded away", () => {
    expect(formatInterval(90)).toBe("Every 90 s")
    expect(formatInterval(5400)).toBe("Every 90 min")
  })
})

describe("intervalText", () => {
  it.each([
    [5, 900, "Every 5 s · Sync 15 min"],
    [30, 300, "Every 30 s · Sync 5 min"],
    [5, 90, "Every 5 s · Sync 90 s"],
    [3600, 7200, "Every 1 h · Sync 2 h"]
  ])("pairs the fix cadence %i s with the sync cadence %i s in the same units", (interval, sync, expected) => {
    expect(intervalText(interval, sync)).toBe(expected)
  })

  it("calls a zero sync interval instant, since every fix is sent as it lands", () => {
    expect(intervalText(5, 0)).toBe("Every 5 s · Instant sync")
  })
})

describe("formatLastFix", () => {
  it("has nothing to date when no fix was ever recorded", () => {
    expect(formatLastFix(null, NOW)).toBe("No fixes yet")
  })

  it("drops the date for a fix from today", () => {
    expect(formatLastFix(TODAY_AT_18_42, NOW)).toBe(`Last fix ${formatTime(TODAY_AT_18_42)}`)
  })

  it("keeps the date for a fix from another day, even one just past midnight", () => {
    const lateLastNight = Math.floor(new Date(2026, 1, 27, 23, 59, 0).getTime() / 1000)
    const earlyToday = new Date(2026, 1, 28, 0, 1, 0)
    expect(formatLastFix(lateLastNight, earlyToday)).toBe(
      `Last fix ${formatDate(lateLastNight)} · ${formatTime(lateLastNight)}`
    )
  })
})
