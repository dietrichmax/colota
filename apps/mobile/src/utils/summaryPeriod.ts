/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { DailyStat } from "../types/global"

export type Period = "week" | "month"

export type PeriodRange = {
  /** Inclusive day keys, "YYYY-MM-DD". */
  firstDay: string
  lastDay: string
  title: string
  caption: string
}

export function dayKeyOf(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${m}-${d}`
}

export function dateOfDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function startOfWeek(date: Date): Date {
  const day = date.getDay()
  const back = day === 0 ? 6 : day - 1
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back)
}

function shortDate(date: Date, withYear: boolean): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear && { year: "numeric" }) })
}

function span(first: Date, last: Date, now: Date): string {
  const withYear = first.getFullYear() !== now.getFullYear() || last.getFullYear() !== now.getFullYear()
  return `${shortDate(first, withYear)} - ${shortDate(last, withYear)}`
}

/** The period `offset` steps before the one holding `now`. */
export function periodRange(period: Period, offset: number, now: Date): PeriodRange {
  if (period === "week") {
    const start = startOfWeek(now)
    start.setDate(start.getDate() - offset * 7)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    const title = offset === 0 ? "This week" : offset === 1 ? "Last week" : span(start, end, now)
    const caption = offset < 2 ? span(start, end, now) : `Week of ${shortDate(start, false)}`
    return { firstDay: dayKeyOf(start), lastDay: dayKeyOf(end), title, caption }
  }
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  const named = start.toLocaleDateString(undefined, {
    month: "long",
    ...(start.getFullYear() !== now.getFullYear() && { year: "numeric" })
  })
  const title = offset === 0 ? "This month" : offset === 1 ? "Last month" : named
  const caption = offset < 2 ? named : span(start, end, now)
  return { firstDay: dayKeyOf(start), lastDay: dayKeyOf(end), title, caption }
}

/** The query window for a range, whole days in local time, never past now. */
export function rangeBounds(range: PeriodRange, now: Date): { start: number; end: number } {
  const first = dateOfDayKey(range.firstDay)
  const last = dateOfDayKey(range.lastDay)
  const end = Math.floor(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime() / 1000) - 1
  return {
    start: Math.floor(first.getTime() / 1000),
    end: Math.min(end, Math.floor(now.getTime() / 1000))
  }
}

export function daysInRange(stats: DailyStat[], range: PeriodRange): DailyStat[] {
  return stats.filter((s) => s.day >= range.firstDay && s.day <= range.lastDay).sort((a, b) => (a.day < b.day ? 1 : -1))
}

export type PeriodTotals = { distanceMeters: number; trips: number; activeDays: number; avgPerDay: number }

export function periodTotals(days: DailyStat[]): PeriodTotals {
  const distanceMeters = days.reduce((sum, d) => sum + d.distanceMeters, 0)
  const trips = days.reduce((sum, d) => sum + d.tripCount, 0)
  const activeDays = days.length
  return { distanceMeters, trips, activeDays, avgPerDay: activeDays > 0 ? distanceMeters / activeDays : 0 }
}
