/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { DailyStat } from "../types/global"
import { formatDistance } from "./geo"
import { pad2 } from "./format"
import { t } from "../i18n/t"

export type MonthData = {
  days: ReadonlySet<string>
  stats: ReadonlyMap<string, DailyStat>
}

export type LastDay = {
  day: string
  stat: DailyStat | undefined
}

export const EMPTY_MONTH: MonthData = { days: new Set(), stats: new Map() }

export const LAST_DAY_SEARCH_MONTHS = 12

export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month + 1)}`
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export async function findLastDayWithData(
  from: Date,
  prefetch: (year: number, month: number) => Promise<MonthData>,
  now: Date = new Date()
): Promise<LastDay | null> {
  const fromKey = dayKey(from)
  const todayKey = dayKey(now)
  for (let back = 0; back <= LAST_DAY_SEARCH_MONTHS; back++) {
    const month = new Date(from.getFullYear(), from.getMonth() - back, 1)
    const data = await prefetch(month.getFullYear(), month.getMonth())
    const day = [...data.days]
      .filter((d) => d < fromKey)
      .sort()
      .pop()
    if (day) return { day, stat: data.stats.get(day) }
  }
  const monthsAhead = Math.min(
    LAST_DAY_SEARCH_MONTHS,
    (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth()
  )
  for (let ahead = 0; ahead <= monthsAhead; ahead++) {
    const month = new Date(from.getFullYear(), from.getMonth() + ahead, 1)
    const data = await prefetch(month.getFullYear(), month.getMonth())
    const day = [...data.days].filter((d) => d > fromKey && d <= todayKey).sort()[0]
    if (day) return { day, stat: data.stats.get(day) }
  }
  return null
}

const points = (n: number) => t("history.points", { count: n, n: n.toLocaleString() })
const trips = (n: number) => t("history.trips", { count: n, n })

export function lastDaySub({ day, stat }: LastDay): string {
  const date = dateFromKey(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  if (!stat) return date
  if (stat.tripCount === 0) return `${date} · ${points(stat.count)}`
  return `${date} · ${trips(stat.tripCount)} · ${formatDistance(stat.distanceMeters)}`
}

export type EmptyDayAction = "lastDay" | "dashboard"

export type EmptyDayVariant = {
  title: string
  hint: string
  action: EmptyDayAction | null
}

export function emptyDayVariant(input: {
  isToday: boolean
  tracking: boolean
  longDate: string
  hasLastDay: boolean
}): EmptyDayVariant {
  if (!input.isToday) {
    return {
      title: t("history.empty.nothingRecorded"),
      hint: input.longDate,
      action: input.hasLastDay ? "lastDay" : null
    }
  }
  if (input.tracking) {
    return { title: t("history.empty.noLocationsYet"), hint: t("history.empty.noLocationsYet.hint"), action: null }
  }
  if (input.hasLastDay) {
    return { title: t("history.empty.noLocationsToday"), hint: t("history.empty.trackingOff"), action: "dashboard" }
  }
  return {
    title: t("history.empty.nothingYet"),
    hint: t("history.empty.nothingYet.hint"),
    action: "dashboard"
  }
}

export function exportMessage(dateLabel: string, tripCount: number, distanceMeters: number): string {
  return `${dateLabel} · ${trips(tripCount)} · ${formatDistance(distanceMeters)}`
}

export function isAdjacentSelection(indices: Iterable<number>): boolean {
  const sorted = [...indices].sort((a, b) => a - b)
  if (sorted.length < 2) return false
  return sorted.every((index, i) => i === 0 || index === sorted[i - 1] + 1)
}
