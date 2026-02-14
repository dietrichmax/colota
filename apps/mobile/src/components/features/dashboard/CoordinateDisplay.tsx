/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { LocationCoords } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { fonts } from "../../../styles/typography"
import { SectionTitle } from "../../ui/SectionTitle"
import { Card } from "../../ui/Card"

/**
 * Props for the CoordinateDisplay component
 */
type Props = {
  /** Location coordinates object containing latitude, longitude, altitude, accuracy, speed, and bearing */
  coords: LocationCoords
}

/**
 * Displays location data in a responsive grid layout with six metric cards.
 *
 * Shows:
 * - Latitude/Longitude (6 decimal places)
 * - Altitude (rounded meters)
 * - Accuracy (1 decimal place, with ± prefix)
 *
 * All values include fallbacks for missing data and adapt to the current theme.
 *
 * @example
 * ```tsx
 * <CoordinateDisplay
 *   coords={{
 *     latitude: 37.7749,
 *     longitude: -122.4194,
 *     altitude: 52,
 *     accuracy: 10.5
 *   }}
 * />
 * ```
 */
export function CoordinateDisplay({ coords }: Props) {
  const { colors } = useTheme()

  // Format values with appropriate precision and fallbacks
  const latitude = coords.latitude?.toFixed(6) ?? "0.000000"
  const longitude = coords.longitude?.toFixed(6) ?? "0.000000"
  const altitude = Math.round(coords.altitude ?? 0)
  const accuracy = coords.accuracy?.toFixed(1) ?? "0.0"

  /**
   * Renders a single coordinate metric card
   */
  const renderCard = (label: string, value: string, unit: string) => (
    <Card variant="elevated">
      <Text style={[styles.coordLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.coordValue, { color: colors.text }]}>
        {value}
        <Text style={styles.coordUnit}> {unit}</Text>
      </Text>
    </Card>
  )

  return (
    <>
      <SectionTitle>CURRENT LOCATION DATA</SectionTitle>
      <View style={styles.container}>
        {/* First Row: Latitude and Longitude */}
        <View style={styles.row}>
          {renderCard("Latitude", latitude, "°")}
          {renderCard("Longitude", longitude, "°")}
        </View>

        {/* Second Row: Altitude and Accuracy */}
        <View style={styles.row}>
          {renderCard("Altitude", altitude.toLocaleString(), "m")}
          {renderCard("Accuracy", `±${accuracy}`, "m")}
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  coordCard: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1
  },
  coordLabel: {
    fontSize: 10,
    ...fonts.semiBold,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  coordValue: {
    fontSize: 15,
    ...fonts.bold,
    letterSpacing: -0.3
  },
  coordUnit: {
    fontSize: 12,
    ...fonts.medium,
    opacity: 0.6
  }
})
