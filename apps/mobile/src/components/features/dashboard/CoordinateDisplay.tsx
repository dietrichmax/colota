/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { useCoords } from "../../../contexts/TrackingProvider"
import { fonts } from "../../../styles/typography"
import { SectionTitle } from "../../ui/SectionTitle"
import { Card } from "../../ui/Card"

export function CoordinateDisplay() {
  const coords = useCoords()
  const { colors } = useTheme()

  if (!coords) return null

  const latitude = coords.latitude?.toFixed(6) ?? "0.000000"
  const longitude = coords.longitude?.toFixed(6) ?? "0.000000"
  const altitude = Math.round(coords.altitude ?? 0).toLocaleString()
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
          {renderCard("Altitude", altitude, "m")}
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
