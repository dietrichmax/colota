/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { View, Text, TextInput, StyleSheet } from "react-native"
import { ThemeColors } from "../../types/global"
import { fonts } from "../../styles/typography"
import { clamp, pad2 } from "../../utils/format"

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  colors: ThemeColors
}

const HOUR_MIN = 0
const HOUR_MAX = 23
const MIN_MIN = 0
const MIN_MAX = 59

function parse(value: string): { h: number; m: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return { h: 0, m: 0 }
  return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) }
}

function format(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`
}

export function TimePicker({ value, onChange, colors }: TimePickerProps) {
  const { h, m } = useMemo(() => parse(value), [value])

  const [hourText, setHourText] = useState(pad2(h))
  const [minuteText, setMinuteText] = useState(pad2(m))

  useEffect(() => setHourText(pad2(h)), [h])
  useEffect(() => setMinuteText(pad2(m)), [m])

  const onHourChange = useCallback((text: string) => {
    setHourText(text.replace(/\D/g, "").slice(0, 2))
  }, [])
  const onMinuteChange = useCallback((text: string) => {
    setMinuteText(text.replace(/\D/g, "").slice(0, 2))
  }, [])

  const commitHour = useCallback(() => {
    const parsed = parseInt(hourText, 10)
    const next = isNaN(parsed) ? h : clamp(parsed, HOUR_MIN, HOUR_MAX)
    setHourText(pad2(next))
    if (next !== h) onChange(format(next, m))
  }, [hourText, h, m, onChange])

  const commitMinute = useCallback(() => {
    const parsed = parseInt(minuteText, 10)
    const next = isNaN(parsed) ? m : clamp(parsed, MIN_MIN, MIN_MAX)
    setMinuteText(pad2(next))
    if (next !== m) onChange(format(h, next))
  }, [minuteText, h, m, onChange])

  return (
    <View style={styles.row}>
      <TextInput
        testID="timepicker-hour-value"
        accessibilityLabel="Hours"
        value={hourText}
        onChangeText={onHourChange}
        onBlur={commitHour}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        style={[
          styles.input,
          { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }
        ]}
      />
      <Text style={[styles.separator, { color: colors.text }]}>:</Text>
      <TextInput
        testID="timepicker-minute-value"
        accessibilityLabel="Minutes"
        value={minuteText}
        onChangeText={onMinuteChange}
        onBlur={commitMinute}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        style={[
          styles.input,
          { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4
  },
  input: {
    minWidth: 64,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    ...fonts.semiBold,
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  separator: {
    fontSize: 15,
    ...fonts.semiBold,
    paddingHorizontal: 2
  }
})
