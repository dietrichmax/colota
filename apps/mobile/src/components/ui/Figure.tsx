/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { CRITICAL_QUEUE_THRESHOLD, HIGH_QUEUE_THRESHOLD } from "../../constants"

// U+2009. The unit hangs off the digits without reading as a separate word.
const THIN_SPACE = "\u2009"

const DISPLAY_FONT_SCALE_CAP = 1.5

export type FigureTone = "default" | "warning" | "error"

/**
 * The queue is the one figure in the app that is allowed to leave ink, and only once it
 * is deep enough to mean something. Everything below the high threshold reads as healthy,
 * so colouring it would cry wolf.
 */
export function queueTone(count: number): FigureTone {
  if (count > CRITICAL_QUEUE_THRESHOLD) return "error"
  if (count > HIGH_QUEUE_THRESHOLD) return "warning"
  return "default"
}

type FigureProps = {
  value: string
  label: string
  unit?: string
  tone?: FigureTone
  testID?: string
}

/** The one hero figure on a screen: display digits, the unit beside them, a label below. */
export function Figure({ value, label, unit, tone = "default", testID }: FigureProps) {
  const { colors } = useTheme()

  const ink = tone === "error" ? colors.error : tone === "warning" ? colors.warning : colors.text
  const spokenValue = unit ? `${value} ${unit}` : value

  return (
    <View testID={testID} accessible accessibilityLabel={`${spokenValue}, ${label}`}>
      <Text style={[styles.value, { color: ink }]} maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}>
        {value}
        {unit ? <Text style={styles.unit}>{THIN_SPACE + unit}</Text> : null}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  value: {
    ...text.display
  },
  unit: {
    ...text.label
  },
  label: {
    ...text.label
  }
})
