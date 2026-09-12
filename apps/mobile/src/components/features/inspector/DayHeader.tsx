/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { formatDistance } from "../../../utils/geo"
import { StepperHeader } from "../../ui/StepperHeader"

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
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
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

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

export function dayLedger(stats: DayStats | null, loading: boolean): string {
  if (loading) return "Loading"
  if (!stats || stats.points === 0) return "No locations recorded"
  if (stats.trips === 0) return `${count(stats.points, "point")} · no trips`
  return `${count(stats.trips, "trip")} · ${formatDistance(stats.distanceMeters)} · ${count(stats.points, "point")}`
}

export function dayCaption(date: Date, stats: DayStats | null, loading: boolean, now: Date = new Date()): string {
  const ledger = dayLedger(stats, loading)
  if (!isRelativeDay(date, now)) return ledger
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${ledger}`
}

export function DayHeader({ date, stats, loading, onPrevious, onNext, onOpenPicker, nextDisabled }: DayHeaderProps) {
  const now = new Date()

  return (
    <StepperHeader
      title={dayTitle(date, now)}
      caption={dayCaption(date, stats, loading, now)}
      onPrevious={onPrevious}
      onNext={onNext}
      previousLabel="Previous day"
      nextLabel="Next day"
      nextDisabled={nextDisabled}
      onPress={onOpenPicker}
      accessibilityLabel={`Change day, ${dayLongDate(date, now)}, ${dayLedger(stats, loading)}`}
      accessibilityHint="Opens the calendar"
      testID="day"
    />
  )
}
