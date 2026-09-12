import {
  dateFromKey,
  dayKey,
  emptyDayVariant,
  exportMessage,
  findLastDayWithData,
  isAdjacentSelection,
  lastDaySub,
  monthKey,
  LAST_DAY_SEARCH_MONTHS,
  type MonthData
} from "../inspectorDay"
import { loadDisplayPreferences } from "../geo"

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: (key: string) => Promise.resolve(key === "unitSystem" ? "metric" : "24h")
  }
}))

beforeAll(() => loadDisplayPreferences())

const stat = (day: string, tripCount: number, count = 40, distanceMeters = 12_400) => ({
  day,
  count,
  startTime: 0,
  endTime: 0,
  distanceMeters,
  tripCount
})

function monthsOf(days: Record<string, ReturnType<typeof stat>>): (year: number, month: number) => Promise<MonthData> {
  return async (year, month) => {
    const prefix = monthKey(year, month)
    const inMonth = Object.keys(days).filter((d) => d.startsWith(prefix))
    return { days: new Set(inMonth), stats: new Map(inMonth.map((d) => [d, days[d]])) }
  }
}

describe("day keys", () => {
  it("round-trips a local date through its key", () => {
    const date = new Date(2026, 8, 3)
    expect(dayKey(date)).toBe("2026-09-03")
    expect(dateFromKey("2026-09-03").getTime()).toBe(date.getTime())
    expect(monthKey(2026, 0)).toBe("2026-01")
  })
})

describe("findLastDayWithData", () => {
  const NOW = new Date(2026, 8, 8)

  it("picks the nearest earlier day, skipping the month gap in between", async () => {
    const prefetch = jest.fn(monthsOf({ "2026-06-30": stat("2026-06-30", 2), "2026-06-12": stat("2026-06-12", 1) }))
    const result = await findLastDayWithData(new Date(2026, 8, 3), prefetch, NOW)
    expect(result).toEqual({ day: "2026-06-30", stat: stat("2026-06-30", 2) })
    expect(prefetch).toHaveBeenCalledTimes(4)
  })

  it("ignores days after the shown one while walking back", async () => {
    const prefetch = monthsOf({ "2026-09-05": stat("2026-09-05", 1), "2026-09-01": stat("2026-09-01", 3) })
    const result = await findLastDayWithData(new Date(2026, 8, 3), prefetch, NOW)
    expect(result?.day).toBe("2026-09-01")
  })

  it("walks forward to today when nothing earlier exists", async () => {
    const prefetch = monthsOf({ "2026-09-07": stat("2026-09-07", 1) })
    const result = await findLastDayWithData(new Date(2025, 10, 20), prefetch, NOW)
    expect(result?.day).toBe("2026-09-07")
  })

  it("never offers a future day", async () => {
    const prefetch = monthsOf({ "2026-09-20": stat("2026-09-20", 1) })
    expect(await findLastDayWithData(new Date(2026, 8, 3), prefetch, NOW)).toBeNull()
  })

  it("gives up after twelve months back and the forward walk", async () => {
    const prefetch = jest.fn(monthsOf({ "2025-06-01": stat("2025-06-01", 1) }))
    expect(await findLastDayWithData(new Date(2026, 8, 3), prefetch, NOW)).toBeNull()
    expect(prefetch).toHaveBeenCalledTimes(14)
  })

  it("caps the forward walk too, so a jump to 2000 never fetches every month since", async () => {
    const prefetch = jest.fn(monthsOf({}))
    expect(await findLastDayWithData(new Date(2020, 0, 1), prefetch, NOW)).toBeNull()
    expect(prefetch).toHaveBeenCalledTimes(2 * LAST_DAY_SEARCH_MONTHS + 2)
  })
})

describe("lastDaySub", () => {
  it("names the day with its trips and distance", () => {
    expect(lastDaySub({ day: "2026-09-02", stat: stat("2026-09-02", 3) })).toBe(
      `${dateFromKey("2026-09-02").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · 3 trips · 12.4 km`
    )
  })

  it("falls back to the point count when the day has no trips", () => {
    expect(lastDaySub({ day: "2026-09-02", stat: stat("2026-09-02", 0, 1) })).toMatch(/ · 1 point$/)
  })

  it("shows the date alone when the stat is missing", () => {
    expect(lastDaySub({ day: "2026-09-02", stat: undefined })).not.toContain("·")
  })
})

describe("emptyDayVariant", () => {
  it("offers the jump to the last day with data on a past day", () => {
    expect(
      emptyDayVariant({ isToday: false, tracking: true, longDate: "Wednesday, September 3", hasLastDay: true })
    ).toEqual({
      title: "Nothing recorded",
      hint: "Wednesday, September 3",
      action: "lastDay"
    })
  })

  it("offers nothing on a past day when no other day has data", () => {
    expect(
      emptyDayVariant({ isToday: false, tracking: false, longDate: "Wednesday, September 3", hasLastDay: false }).action
    ).toBeNull()
  })

  it("waits for the first fix while tracking is on today", () => {
    expect(emptyDayVariant({ isToday: true, tracking: true, longDate: "", hasLastDay: true })).toEqual({
      title: "No locations yet",
      hint: "Tracking is on. The first fix lands here.",
      action: null
    })
  })

  it("points to the Dashboard when tracking is off today", () => {
    expect(emptyDayVariant({ isToday: true, tracking: false, longDate: "", hasLastDay: true })).toEqual({
      title: "No locations today",
      hint: "Tracking is off.",
      action: "dashboard"
    })
  })

  it("reads as a first install when no day has data and tracking is off", () => {
    expect(emptyDayVariant({ isToday: true, tracking: false, longDate: "", hasLastDay: false })).toEqual({
      title: "Nothing recorded yet",
      hint: "Start tracking on the Dashboard and today's track appears here.",
      action: "dashboard"
    })
  })
})

describe("export chooser", () => {
  it("describes the export as date, trips and distance", () => {
    expect(exportMessage("Wed, Sep 3", 3, 12_400)).toBe("Wed, Sep 3 · 3 trips · 12.4 km")
    expect(exportMessage("Today", 1, 500)).toBe("Today · 1 trip · 0.5 km")
  })
})

describe("isAdjacentSelection", () => {
  it("accepts consecutive trips in any order and rejects a gap or a single trip", () => {
    expect(isAdjacentSelection([3, 1, 2])).toBe(true)
    expect(isAdjacentSelection([1, 3])).toBe(false)
    expect(isAdjacentSelection([2])).toBe(false)
    expect(isAdjacentSelection(new Set([4, 5]))).toBe(true)
  })
})
