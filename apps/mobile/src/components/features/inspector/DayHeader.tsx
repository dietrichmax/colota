/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { formatDistance } from "../../../utils/geo"
import { StepperHeader } from "../../ui/StepperHeader"
import { t } from "../../../i18n/t"
import { useTranslation } from "../../../i18n/useTranslation"

export type DayStats = {
  points: number
  trips: number
  distanceMeters: number
}

type DayHeaderProps = {
  date: Date
  stats: DayStats | null
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onOpenPicker: () => void
  nextDisabled: boolean
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysBefore(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
}

function withYear(date: Date, now: Date): { year?: "numeric" } {
  return date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }
}

export function isRelativeDay(date: Date, now: Date = new Date()): boolean {
  const days = daysBefore(date, now)
  return days === 0 || days === 1
}

export function dayTitle(date: Date, now: Date = new Date()): string {
  const days = daysBefore(date, now)
  if (days === 0) return t("day.today")
  if (days === 1) return t("day.yesterday")
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...withYear(date, now)
  })
}

export function dayLongDate(date: Date, now: Date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...withYear(date, now) })
}

const points = (n: number) => t("history.points", { count: n, n: n.toLocaleString() })
const trips = (n: number) => t("history.trips", { count: n, n })

export function dayLedger(stats: DayStats | null, loading: boolean): string {
  if (loading) return t("day.loading")
  if (!stats || stats.points === 0) return t("day.noLocations")
  if (stats.trips === 0) return `${points(stats.points)} · ${t("day.noTrips")}`
  return `${trips(stats.trips)} · ${formatDistance(stats.distanceMeters)} · ${points(stats.points)}`
}

export function dayCaption(date: Date, stats: DayStats | null, loading: boolean, now: Date = new Date()): string {
  const ledger = dayLedger(stats, loading)
  if (!isRelativeDay(date, now)) return ledger
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${ledger}`
}

export function DayHeader({ date, stats, loading, onPrevious, onNext, onOpenPicker, nextDisabled }: DayHeaderProps) {
  useTranslation()
  const now = new Date()

  return (
    <StepperHeader
      title={dayTitle(date, now)}
      caption={dayCaption(date, stats, loading, now)}
      onPrevious={onPrevious}
      onNext={onNext}
      previousLabel={t("day.previous")}
      nextLabel={t("day.next")}
      nextDisabled={nextDisabled}
      onPress={onOpenPicker}
      accessibilityLabel={t("day.change", { date: dayLongDate(date, now), ledger: dayLedger(stats, loading) })}
      accessibilityHint={t("day.opensCalendar")}
      testID="day"
    />
  )
}
