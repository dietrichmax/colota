/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { ScrollView, StyleSheet } from "react-native"
import { Card } from "../../ui/Card"
import { Divider } from "../../ui/Divider"
import { TripRow } from "./TripRow"
import { space } from "../../../constants"
import type { Trip } from "../../../types/global"

type TripListProps = {
  trips: Trip[]
  selected: Set<number>
  onToggle: (index: number) => void
  onEnterSelection: (index: number) => void
  onOpenTrip: (index: number) => void
}

export function TripList({ trips, selected, onToggle, onEnterSelection, onOpenTrip }: TripListProps) {
  if (trips.length === 0) return null
  const selecting = selected.size > 0

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card rows>
        {trips.map((trip, i) => (
          <React.Fragment key={trip.index}>
            {i > 0 && <Divider tight inset />}
            <TripRow
              trip={trip}
              index={trip.index}
              selected={selected.has(trip.index)}
              selecting={selecting}
              onPress={() => (selecting ? onToggle(trip.index) : onOpenTrip(trip.index))}
              onLongPress={() => (selecting ? onToggle(trip.index) : onEnterSelection(trip.index))}
              testID={`trip-row-${trip.index}`}
            />
          </React.Fragment>
        ))}
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  }
})
