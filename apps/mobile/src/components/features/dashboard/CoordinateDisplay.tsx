/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { useCoords } from "../../../contexts/TrackingProvider"
import { useTranslation } from "../../../i18n/useTranslation"
import { text } from "../../../styles/typography"
import { formatShortDistance, formatTime } from "../../../utils/geo"
import { SectionTitle } from "../../ui/SectionTitle"

/** The fix, as a heading with its time, the pair itself and the quality below it. */
export function CoordinateDisplay() {
  const coords = useCoords()
  const { colors } = useTheme()
  const { t } = useTranslation()

  if (!coords) return null

  const latitude = coords.latitude?.toFixed(6) ?? "0.000000"
  const longitude = coords.longitude?.toFixed(6) ?? "0.000000"
  const pair = `${latitude}, ${longitude}`
  const detail = t("dashboard.fix.detail", {
    accuracy: formatShortDistance(coords.accuracy ?? 0),
    altitude: formatShortDistance(coords.altitude ?? 0)
  })
  const fixTime = coords.timestamp ? formatTime(coords.timestamp) : undefined

  return (
    <View testID="coordinate-display">
      <SectionTitle first caption={fixTime}>
        {t("dashboard.now")}
      </SectionTitle>
      <Text style={[styles.pair, { color: colors.text }]}>{pair}</Text>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pair: {
    ...text.coord,
    writingDirection: "ltr"
  },
  detail: {
    ...text.caption
  }
})
