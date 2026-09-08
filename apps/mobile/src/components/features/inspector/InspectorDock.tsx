/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Check, MapPin, MapPinOff, Route, type LucideIcon } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../../hooks/useTheme"
import { HIT_SLOP_MD, size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { fonts, fontSizes } from "../../../styles/typography"
import { formatDistance, formatTime } from "../../../utils/geo"
import type { Trip } from "../../../types/global"
import { Divider } from "../../ui/Divider"
import { ListItem } from "../../ui/ListItem"
import { MapDock } from "../../ui/MapDock"
import { StateLine } from "../../ui/StateLine"
import { PointCard, type PointCardProps } from "./PointCard"
import { TripRow, TripSwatch } from "./TripRow"

export type DockEmptyAction = {
  icon: LucideIcon
  label: string
  sub: string
  onPress: () => void
}

export type DockContent =
  | { kind: "legend"; trips: Trip[]; focusedTripIndex: number | null; onFocusTrip: (index: number | null) => void }
  | { kind: "points"; count: number; startTime: number; endTime: number }
  | ({ kind: "point" } & PointCardProps)
  | { kind: "empty"; title: string; hint: string; action?: DockEmptyAction }

type InspectorDockProps = {
  content: DockContent
  left: number
  right: number
  maxHeight: number
  onLayout?: (event: LayoutChangeEvent) => void
}

type TripChipProps = {
  trip: Trip
  selected: boolean
  onPress: () => void
}

function TripChip({ trip, selected, onPress }: TripChipProps) {
  const { colors } = useTheme()
  const content = selected ? colors.onPrimaryContainer : colors.text
  const start = formatTime(trip.startTime)

  return (
    <Pressable
      testID={`dock-trip-${trip.index}`}
      accessibilityRole="button"
      accessibilityLabel={`Trip ${trip.index}, starts ${start}`}
      accessibilityState={{ selected }}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      hitSlop={HIT_SLOP_MD}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primaryContainer : colors.well }]}
    >
      {selected ? <Check size={size.icon.sm} color={content} strokeWidth={2} /> : <TripSwatch index={trip.index} />}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected, { color: content }]}>{start}</Text>
    </Pressable>
  )
}

function Legend({ trips, focusedTripIndex, onFocusTrip }: Extract<DockContent, { kind: "legend" }>) {
  const { colors } = useTheme()
  const focused = trips.find((trip) => trip.index === focusedTripIndex) ?? null
  const first = trips[0]
  const last = trips[trips.length - 1]
  const distance = trips.reduce((sum, trip) => sum + trip.distance, 0)

  return (
    <>
      {focused ? (
        <TripRow
          trip={focused}
          index={focused.index}
          selected
          selecting
          onPress={() => onFocusTrip(null)}
          onLongPress={() => {}}
          testID="dock-focused-trip"
        />
      ) : (
        <StateLine
          icon={Route}
          iconColor={colors.textSecondary}
          label={`${trips.length} ${trips.length === 1 ? "trip" : "trips"}`}
          caption={`${formatTime(first.startTime)} - ${formatTime(last.endTime)} · ${formatDistance(distance)}`}
          testID="dock-legend"
        />
      )}
      <Divider tight />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        testID="dock-trip-strip"
      >
        {trips.map((trip) => (
          <TripChip
            key={trip.index}
            trip={trip}
            selected={trip.index === focusedTripIndex}
            onPress={() => onFocusTrip(trip.index === focusedTripIndex ? null : trip.index)}
          />
        ))}
      </ScrollView>
    </>
  )
}

function DockBody({ content }: { content: DockContent }) {
  const { colors } = useTheme()

  switch (content.kind) {
    case "legend":
      return <Legend {...content} />
    case "points": {
      const { count, startTime, endTime } = content
      const points = `${count} ${count === 1 ? "point" : "points"}`
      return (
        <StateLine
          icon={MapPin}
          iconColor={colors.textSecondary}
          label="No trips"
          caption={`${points} · ${formatTime(startTime)} - ${formatTime(endTime)}`}
          testID="dock-points"
        />
      )
    }
    case "point":
      return <PointCard {...content} />
    case "empty": {
      const { title, hint, action } = content
      return (
        <>
          <StateLine
            icon={MapPinOff}
            iconColor={colors.textSecondary}
            label={title}
            caption={hint}
            testID="dock-empty"
          />
          {action && (
            <>
              <Divider tight inset />
              <ListItem
                icon={action.icon}
                label={action.label}
                sub={action.sub}
                onPress={action.onPress}
                testID="dock-empty-action"
              />
            </>
          )}
        </>
      )
    }
  }
}

export function InspectorDock({ content, left, right, maxHeight, onLayout }: InspectorDockProps) {
  return (
    <View style={[styles.dock, { left, right }]} onLayout={onLayout} testID="inspector-dock">
      <MapDock maxHeight={maxHeight}>
        <DockBody content={content} />
      </MapDock>
    </View>
  )
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    bottom: space.lg
  },
  // The strip scrolls edge to edge inside the card, so it cancels the card's inset the way a row does.
  strip: {
    marginHorizontal: -space.lg
  },
  stripContent: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm
  },
  chip: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: size.chip,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md
  },
  chipLabel: {
    fontSize: fontSizes.caption,
    ...fonts.medium,
    fontVariant: ["tabular-nums"]
  },
  chipLabelSelected: {
    ...fonts.semiBold
  }
})
