import { daysInRange, periodRange, periodTotals, rangeBounds } from "../summaryPeriod"
import type { DailyStat } from "../../types/global"

const now = new Date(2026, 8, 9, 15, 0)
const stat = (day: string, distanceMeters = 1000, tripCount = 1): DailyStat => ({
  day,
  count: 10,
  startTime: 0,
  endTime: 3600,
  distanceMeters,
  tripCount
})

describe("periodRange", () => {
  it("names the current and last week by their place and older weeks by their dates, Monday first", () => {
    expect(periodRange("week", 0, now)).toMatchObject({
      firstDay: "2026-09-07",
      lastDay: "2026-09-13",
      title: "This week"
    })
    expect(periodRange("week", 1, now)).toMatchObject({
      firstDay: "2026-08-31",
      lastDay: "2026-09-06",
      title: "Last week"
    })
    expect(periodRange("week", 3, now).title).toMatch(/Aug 17 - Aug 23/)
  })

  it("steps months whole, so a range never straddles two of them", () => {
    expect(periodRange("month", 1, now)).toMatchObject({
      firstDay: "2026-08-01",
      lastDay: "2026-08-31",
      title: "Last month"
    })
    expect(periodRange("month", 2, now).title).toBe("July")
  })
})

describe("daysInRange and periodTotals", () => {
  it("keeps the days inside the range newest first and sums them into the ledger", () => {
    const stats = [stat("2026-09-01", 4000, 2), stat("2026-09-08", 6000, 1), stat("2026-09-20")]
    const days = daysInRange(stats, periodRange("week", 0, now))

    expect(days.map((d) => d.day)).toEqual(["2026-09-08"])
    expect(periodTotals(stats.slice(0, 2))).toEqual({ distanceMeters: 10000, trips: 3, activeDays: 2, avgPerDay: 5000 })
    expect(periodTotals([])).toEqual({ distanceMeters: 0, trips: 0, activeDays: 0, avgPerDay: 0 })
  })
})

describe("rangeBounds", () => {
  it("queries whole local days and never past now", () => {
    const week = periodRange("week", 0, now)
    const bounds = rangeBounds(week, now)

    expect(bounds.start).toBe(Math.floor(new Date(2026, 8, 7).getTime() / 1000))
    expect(bounds.end).toBe(Math.floor(now.getTime() / 1000))
    expect(rangeBounds(periodRange("month", 1, now), now).end).toBe(
      Math.floor(new Date(2026, 8, 1).getTime() / 1000) - 1
    )
  })
})
